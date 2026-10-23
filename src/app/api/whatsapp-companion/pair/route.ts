import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import makeWASocket, { useMultiFileAuthState, delay, DisconnectReason, Browsers, fetchLatestBaileysVersion, BufferJSON } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export const dynamic = "force-dynamic";

// In-memory cache of active companion sockets strictly per company ID
const activeSockets = new Map<string, any>();

function getAuthDirs(companyId: string): string[] {
  if (!companyId || companyId === "default") {
    return [];
  }
  return [
    path.join(os.tmpdir(), "allota_wa", `wa_${companyId}`),
    path.join(process.cwd(), "tmp", "allota_wa", `wa_${companyId}`),
  ];
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = getActiveCompanyId(session);
    if (!companyId || companyId === "default") {
      return NextResponse.json({ error: "No organization workspace selected." }, { status: 400 });
    }

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

    const authDir = path.join(os.tmpdir(), "allota_wa", `wa_${companyId}`);
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
            where: { companyId },
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
            where: { companyId },
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
          where: { companyId },
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
        phone: fullPhone,
      });
    }

    const code = await sock.requestPairingCode(fullPhone);

    return NextResponse.json({
      success: true,
      pairingCode: code,
      phone: fullPhone,
    });
  } catch (err: any) {
    console.error("Failed to request pairing code:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to initiate pairing. Please check the phone number." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = getActiveCompanyId(session);
  if (!companyId || companyId === "default") {
    return NextResponse.json({ status: "NOT_CONNECTED", phone: null });
  }

  const current = activeSockets.get(companyId);

  // 1. Check in-memory active socket for THIS specific company
  if (current?.status === "CONNECTED" && current.phone) {
    return NextResponse.json({
      status: "CONNECTED",
      phone: current.phone,
      connectedAt: current.connectedAt || null,
    });
  }

  // 2. Check company-isolated persisted credentials on disk
  const authDirs = getAuthDirs(companyId);
  let savedPhone: string | null = null;
  let isSaved = false;

  for (const dir of authDirs) {
    const credsPath = path.join(dir, "creds.json");
    if (fs.existsSync(credsPath)) {
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

  // 3. Fallback to PostgreSQL database (CompanySettings strictly for this company)
  if (!isSaved) {
    try {
      const settings = await prisma.companySettings.findFirst({
        where: { companyId },
        select: {
          whatsappConnected: true,
          whatsappCompanionPhone: true,
          whatsappCompanionCreds: true,
        },
      });

      if (settings?.whatsappConnected && (settings?.whatsappCompanionPhone || settings?.whatsappCompanionCreds)) {
        if (settings.whatsappCompanionPhone) {
          isSaved = true;
          savedPhone = settings.whatsappCompanionPhone;
        } else if (settings.whatsappCompanionCreds) {
          try {
            const decryptedCreds = JSON.parse(settings.whatsappCompanionCreds, BufferJSON.reviver);
            if (decryptedCreds?.registered && decryptedCreds?.me?.id) {
              isSaved = true;
              savedPhone = decryptedCreds.me.id.split(":")[0];
            }
          } catch {}
        }
      }
    } catch (vaultErr) {
      console.warn("[Encrypted Vault] Creds check error:", vaultErr);
    }
  }

  const isConnected = Boolean(isSaved && savedPhone);

  return NextResponse.json({
    status: isConnected ? "CONNECTED" : (current?.status || "NOT_CONNECTED"),
    phone: isConnected ? savedPhone : null,
    connectedAt: current?.connectedAt || null,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = getActiveCompanyId(session);
  if (!companyId || companyId === "default") {
    return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
  }

  const current = activeSockets.get(companyId);

  if (current?.sock) {
    try {
      current.sock.end(undefined);
    } catch {}
  }
  activeSockets.delete(companyId);

  // Clear credentials & status in database strictly for this company
  try {
    await prisma.companySettings.updateMany({
      where: { companyId },
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
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }

  return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
}
