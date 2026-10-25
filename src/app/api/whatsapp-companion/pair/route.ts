import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import makeWASocket, { 
  useMultiFileAuthState, 
  delay, 
  DisconnectReason, 
  Browsers, 
  fetchLatestBaileysVersion, 
  BufferJSON 
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// In-memory cache of active companion sockets strictly per company ID
const activeSockets = new Map<string, {
  sock: any;
  phone?: string;
  qrCode?: string;
  status: "PAIRING_REQUESTED" | "AWAITING_SCAN" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
  connectedAt?: Date;
  updatedAt: Date;
}>();

function getAuthDirs(companyId: string): string[] {
  if (!companyId || companyId === "default") {
    return [];
  }
  // os.tmpdir() is guaranteed writable in both Vercel AWS Lambda (/tmp) and local environments
  return [path.join(os.tmpdir(), "allota_wa", `wa_${companyId}`)];
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
    const mode = body.mode || (body.phone ? "code" : "qr");
    const rawPhone = String(body.phone || "").trim();

    // 1. Delegate directly to the persistent 24/7 Render companion service strictly for this company
    const companionHost = (process.env.COMPANION_SERVICE_URL || "https://allota-whatsapp-companion.onrender.com").replace(/\/$/, "");
    if (companionHost) {
      try {
        if (mode === "code") {
          const remoteRes = await fetch(`${companionHost}/api/${companyId}/pair-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: rawPhone || "917494809665" }),
            cache: "no-store",
          });
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            return NextResponse.json(remoteData);
          }
        } else {
          const remoteRes = await fetch(`${companionHost}/api/${companyId}/qr`, { cache: "no-store" });
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            return NextResponse.json({
              success: true,
              status: remoteData.status,
              qrCode: remoteData.qrCode,
              phone: remoteData.phone,
            });
          }
        }
      } catch (remoteErr) {
        console.warn("[Companion Bridge] Remote host fetch:", remoteErr);
      }
    }

    const authDir = path.join(os.tmpdir(), "allota_wa", `wa_${companyId}`);
    
    // Clean socket if already running
    const existing = activeSockets.get(companyId);
    if (existing?.sock) {
      try { existing.sock.end(undefined); } catch {}
      activeSockets.delete(companyId);
    }

    // CRITICAL FIX: If generating a fresh QR code and not already registered,
    // completely purge stale/corrupted key files so WhatsApp gets a 100% pristine cryptographic handshake.
    // Leaving corrupt auth files causes WhatsApp mobile app to throw "Could not connect / Unable to link device".
    if (mode === "qr" && fs.existsSync(authDir)) {
      const credsPath = path.join(authDir, "creds.json");
      let isRegistered = false;
      if (fs.existsSync(credsPath)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
          isRegistered = Boolean(creds?.registered && creds?.me?.id);
        } catch {}
      }
      if (!isRegistered) {
        try {
          fs.rmSync(authDir, { recursive: true, force: true });
        } catch {}
      }
    }

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] as [number, number, number] }));
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }) as any,
      browser: ["Mac OS", "Chrome", "130.0.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 15000,
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 250,
    });

    const currentSocketRecord: {
      sock: any;
      phone?: string;
      qrCode?: string;
      status: "PAIRING_REQUESTED" | "AWAITING_SCAN" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
      connectedAt?: Date;
      updatedAt: Date;
    } = {
      sock,
      status: mode === "qr" ? "AWAITING_SCAN" : "PAIRING_REQUESTED",
      updatedAt: new Date(),
    };

    activeSockets.set(companyId, currentSocketRecord);

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      if (sock.authState.creds.registered) {
        try {
          const credsPhone = sock.authState.creds.me?.id
            ? sock.authState.creds.me.id.split(":")[0]
            : currentSocketRecord.phone;
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

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { width: 380, margin: 2 });
          currentSocketRecord.qrCode = dataUrl;
          currentSocketRecord.status = "AWAITING_SCAN";
        } catch (qrErr) {
          console.error("QR Code generation error:", qrErr);
        }
      }

      if (connection === "open") {
        const connectedUserPhone = sock.user?.id ? sock.user.id.split(":")[0] : currentSocketRecord.phone;
        currentSocketRecord.status = "CONNECTED";
        currentSocketRecord.phone = connectedUserPhone;
        currentSocketRecord.connectedAt = new Date();

        try {
          await prisma.companySettings.updateMany({
            where: { companyId },
            data: {
              whatsappConnected: true,
              whatsappCompanionPhone: connectedUserPhone,
            },
          });
        } catch (e) {
          console.warn("DB update on connection.open:", e);
        }
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        currentSocketRecord.status = statusCode === DisconnectReason.loggedOut ? "LOGGED_OUT" : "DISCONNECTED";
      }
    });

    // Check if already registered
    if (sock.authState.creds.registered) {
      const credsPhone = sock.authState.creds.me?.id?.split(":")[0] || "Registered Phone";
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        status: "CONNECTED",
        phone: credsPhone,
      });
    }

    if (mode === "qr") {
      // Poll for QR generation (up to 7 seconds)
      const startWait = Date.now();
      while (!currentSocketRecord.qrCode && Date.now() - startWait < 7000) {
        await delay(300);
      }

      if (currentSocketRecord.qrCode) {
        return NextResponse.json({
          success: true,
          mode: "qr",
          qrCode: currentSocketRecord.qrCode,
          status: "AWAITING_SCAN",
        });
      } else {
        return NextResponse.json({
          error: "QR code generation timed out. Please try again.",
        }, { status: 504 });
      }
    }

    // Code Pairing Mode
    const digits = rawPhone.replace(/\D/g, "");
    const fullPhone = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`;

    if (fullPhone.length < 10) {
      return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
    }

    currentSocketRecord.phone = fullPhone;
    await delay(3500);

    const code = await sock.requestPairingCode(fullPhone);

    return NextResponse.json({
      success: true,
      mode: "code",
      pairingCode: code,
      phone: fullPhone,
    });
  } catch (err: any) {
    console.error("Failed to request WhatsApp connection:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to initiate WhatsApp connection." },
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

  // 1. Delegate directly to the persistent 24/7 Render companion service strictly for this company
  const companionHost = (process.env.COMPANION_SERVICE_URL || "https://allota-whatsapp-companion.onrender.com").replace(/\/$/, "");
  if (companionHost) {
    try {
      const remoteRes = await fetch(`${companionHost}/api/${companyId}/status`, { cache: "no-store" });
      if (remoteRes.ok) {
        const remoteData = await remoteRes.json();
        if (remoteData.status === "CONNECTED") {
          try {
            await prisma.companySettings.updateMany({
              where: { companyId },
              data: {
                whatsappConnected: true,
                whatsappCompanionPhone: remoteData.phone,
              },
            });
          } catch {}
          return NextResponse.json({
            status: "CONNECTED",
            phone: remoteData.phone,
          });
        }
      }
    } catch {}
  }

  const current = activeSockets.get(companyId);

  // 1. If currently active in memory
  if (current?.status === "CONNECTED" && current.phone) {
    return NextResponse.json({
      status: "CONNECTED",
      phone: current.phone,
      connectedAt: current.connectedAt || null,
    });
  }

  if (current?.status === "AWAITING_SCAN" && current.qrCode) {
    return NextResponse.json({
      status: "AWAITING_SCAN",
      qrCode: current.qrCode,
    });
  }

  // 2. Check company-isolated persisted credentials on disk in os.tmpdir()
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
      } catch {}
    }
  }

  // 3. Fallback to PostgreSQL database
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

  const companionHost = (process.env.COMPANION_SERVICE_URL || "https://allota-whatsapp-companion.onrender.com").replace(/\/$/, "");
  if (companionHost) {
    try {
      await fetch(`${companionHost}/api/${companyId}/disconnect`, { method: "POST" });
    } catch {}
  }

  const current = activeSockets.get(companyId);

  if (current?.sock) {
    try {
      current.sock.end(undefined);
    } catch {}
  }
  activeSockets.delete(companyId);

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
