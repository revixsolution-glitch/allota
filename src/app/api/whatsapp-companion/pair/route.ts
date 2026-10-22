import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import makeWASocket, { useMultiFileAuthState, delay, DisconnectReason, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
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

    sock.ev.on("creds.update", saveCreds);

    activeSockets.set(companyId, {
      sock,
      phone: fullPhone,
      status: "PAIRING_REQUESTED",
      updatedAt: new Date(),
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
      const current = activeSockets.get(companyId);

      if (connection === "open") {
        if (current) {
          current.status = "CONNECTED";
          current.connectedAt = new Date();
        }
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
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
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

  // Check persisted credentials on disk
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

  const isConnected = current?.status === "CONNECTED" || isSaved;

  return NextResponse.json({
    status: isConnected ? "CONNECTED" : (current?.status || "NOT_CONNECTED"),
    phone: current?.phone || savedPhone || null,
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

  const authDirs = getAuthDirs(companyId);
  for (const dir of authDirs) {
    if (fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }

  return NextResponse.json({ success: true, status: "DISCONNECTED" });
}
