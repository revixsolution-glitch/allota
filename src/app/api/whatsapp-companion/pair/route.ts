import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import makeWASocket, { useMultiFileAuthState, delay, DisconnectReason, Browsers, fetchLatestBaileysVersion, BufferJSON } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export const dynamic = "force-dynamic";

// In-memory cache of active companion sockets per company
const activeSockets = new Map<string, any>();

function getAuthDirs(companyId: string) {
  return [
    path.join(os.tmpdir(), `wa_auth_${companyId}`),
    path.join(process.cwd(), "tmp", `wa_auth_${companyId}`),
    path.join(process.cwd(), "tmp", "whatsapp_auth_test"),
  ];
}

function getCompanySettingsWhere(companyId: string) {
  return companyId && companyId !== "default" ? { companyId } : { id: "default" };
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = getActiveCompanyId(session) || "default";
    const body = await request.json().catch(() => ({}));
    const rawPhone = String(body.phone || "").trim();

    if (!rawPhone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    const digits = rawPhone.replace(/\D/g, "");
    const fullPhone = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`;

    if (fullPhone.length < 10) {
      return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
    }

    const authDir = path.join(os.tmpdir(), `wa_auth_${companyId}`);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }) as any,
      browser: Browsers.macOS("Chrome"),
    });

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      if (sock.authState.creds.registered) {
        try {
          const credsPhone = sock.authState.creds.me?.id
            ? sock.authState.creds.me.id.split(":")[0]
            : fullPhone;
          await prisma.companySettings.updateMany({
            where: getCompanySettingsWhere(companyId),
            data: {
              whatsappConnected: true,
              whatsappCompanionPhone: credsPhone,
              whatsappCompanionCreds: JSON.stringify(sock.authState.creds, BufferJSON.replacer),
            },
          });
        } catch (dbErr) {
          console.warn("[Encrypted Vault] Creds backup:", dbErr);
        }
      }
    });

    activeSockets.set(companyId, {
      sock,
      phone: fullPhone,
      status: "PAIRING_REQUESTED",
      updatedAt: new Date(),
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      const current = activeSockets.get(companyId);

      if (connection === "open") {
        if (current) {
          current.status = "CONNECTED";
          current.connectedAt = new Date();
        }
        try {
          await prisma.companySettings.updateMany({
            where: getCompanySettingsWhere(companyId),
            data: {
              whatsappConnected: true,
              whatsappCompanionPhone: fullPhone,
            },
          });
        } catch {}
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (current) {
          current.status = statusCode === DisconnectReason.loggedOut ? "LOGGED_OUT" : "DISCONNECTED";
        }
      }
    });

    // Wait 3.5 seconds for socket handshake before requesting pairing code
    await delay(3500);

    if (sock.authState.creds.registered) {
      try {
        await prisma.companySettings.updateMany({
          where: getCompanySettingsWhere(companyId),
          data: {
            whatsappConnected: true,
            whatsappCompanionPhone: fullPhone,
            whatsappCompanionCreds: JSON.stringify(sock.authState.creds, BufferJSON.replacer),
          },
        });
      } catch (dbErr) {
        console.warn("[Encrypted Vault] Creds backup:", dbErr);
      }

      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        status: "CONNECTED",
        message: "This phone number is already linked and connected!",
        phone: fullPhone,
      });
    }

    const pairingCode = await sock.requestPairingCode(fullPhone);

    return NextResponse.json({
      success: true,
      pairingCode,
      phone: fullPhone,
      expiresInSeconds: 120,
    });
  } catch (error: any) {
    console.error("Pairing code error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate pairing code. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = getActiveCompanyId(session) || "default";
  const current = activeSockets.get(companyId);

  // 1. Check in-memory active socket
  if (current?.status === "CONNECTED") {
    return NextResponse.json({
      status: "CONNECTED",
      phone: current.phone,
      connectedAt: current.connectedAt || null,
    });
  }

  // 2. Check persisted credentials on disk
  const authDirs = getAuthDirs(companyId);
  let savedPhone: string | null = null;
  let isSaved = false;

  for (const dir of authDirs) {
    const credsPath = path.join(dir, "creds.json");
    if (fs.existsSync(/*turbopackIgnore: true*/ credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
        if (creds?.registered && creds?.me?.id) {
          isSaved = true;
          savedPhone = creds.me.id.split(":")[0];
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  // 3. Fallback to PostgreSQL database (CompanySettings)
  if (!isSaved) {
    try {
      const settings = await prisma.companySettings.findFirst({
        where: getCompanySettingsWhere(companyId),
        select: {
          whatsappConnected: true,
          whatsappCompanionPhone: true,
          whatsappCompanionCreds: true,
        },
      });

      if (settings?.whatsappConnected || settings?.whatsappCompanionCreds) {
        isSaved = true;
        savedPhone = settings.whatsappCompanionPhone || null;
        if (!savedPhone && settings?.whatsappCompanionCreds) {
          try {
            const decryptedCreds = JSON.parse(settings.whatsappCompanionCreds, BufferJSON.reviver);
            if (decryptedCreds?.me?.id) {
              savedPhone = decryptedCreds.me.id.split(":")[0];
            }
          } catch {}
        }
      }
    } catch (vaultErr) {
      console.warn("[Encrypted Vault] Creds check error:", vaultErr);
    }
  }

  // Fallback to company contactPhone if connected without phone
  if (isSaved && !savedPhone && companyId !== "default") {
    try {
      const comp = await prisma.company.findUnique({
        where: { id: companyId },
        select: { contactPhone: true },
      });
      if (comp?.contactPhone) savedPhone = comp.contactPhone;
    } catch {}
  }

  const isConnected = isSaved || current?.status === "CONNECTED";

  return NextResponse.json({
    status: isConnected ? "CONNECTED" : (current?.status || "NOT_CONNECTED"),
    phone: savedPhone || current?.phone || null,
    connectedAt: current?.connectedAt || null,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = getActiveCompanyId(session) || "default";
  const current = activeSockets.get(companyId);

  if (current?.sock) {
    try {
      current.sock.end(undefined);
    } catch {}
  }
  activeSockets.delete(companyId);

  // Clear credentials & status in database
  try {
    await prisma.companySettings.updateMany({
      where: getCompanySettingsWhere(companyId),
      data: {
        whatsappConnected: false,
        whatsappCompanionPhone: null,
        whatsappCompanionCreds: null,
      },
    });
  } catch (err) {
    console.warn("[Encrypted Vault] Clear DB creds:", err);
  }

  const authDirs = getAuthDirs(companyId);
  for (const dir of authDirs) {
    if (fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }

  return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
}
