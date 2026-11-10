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

function getAuthDirs(targetId: string): string[] {
  if (!targetId || targetId === "default") {
    return [];
  }
  return [
    path.join(os.tmpdir(), "allota_wa", `wa_${targetId}`),
    path.join(process.cwd(), "companion-service", "data", "wa_auth", `wa_${targetId}`),
    path.join(process.cwd(), "companion-service", "data", "wa_auth", targetId),
  ];
}

async function getCompanionHost(): Promise<string> {
  if (process.env.COMPANION_SERVICE_URL) {
    return process.env.COMPANION_SERVICE_URL.replace(/\/$/, "");
  }
  try {
    const localRes = await fetch("http://127.0.0.1:10000/health", { signal: AbortSignal.timeout(1000) });
    if (localRes.ok) {
      return "http://127.0.0.1:10000";
    }
  } catch {}
  return "http://127.0.0.1:10000";
}

async function verifyKesroxAccess(session: any, companyId: string | null): Promise<boolean> {
  if (companyId === "cmubi8zf6000004l8y45hhuds") return true;
  if (!companyId) return false;
  try {
    const comp = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, slug: true },
    });
    return Boolean(
      comp?.name?.toLowerCase().includes("kesrox") ||
      comp?.slug?.toLowerCase().includes("kesrox")
    );
  } catch {
    return false;
  }
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

    const isEmployee = session.role === "EMPLOYEE";
    if (isEmployee) {
      const isKesrox = await verifyKesroxAccess(session, companyId);
      if (!isKesrox) {
        return NextResponse.json(
          { error: "WhatsApp connector for employees is currently available for Kesrox testing only." },
          { status: 403 }
        );
      }
    }

    const targetId = isEmployee && session.employeeId ? `emp_${session.employeeId}` : companyId;

    const body = await request.json().catch(() => ({}));
    const mode = body.mode || (body.phone ? "code" : "qr");
    const rawPhone = String(body.phone || "").replace(/\D/g, "").trim();

    // Persist entered contact phone on the employee or company record
    if (rawPhone) {
      const formatted = rawPhone.length === 10
        ? `+91 ${rawPhone.slice(0, 5)} ${rawPhone.slice(5)}`
        : rawPhone.length === 12 && rawPhone.startsWith("91")
        ? `+91 ${rawPhone.slice(2, 7)} ${rawPhone.slice(7)}`
        : `+${rawPhone}`;

      if (isEmployee && session.employeeId) {
        await prisma.employee.update({
          where: { id: session.employeeId },
          data: { phoneNumber: formatted },
        }).catch(() => null);
      } else if (companyId && companyId !== "default") {
        await prisma.company.update({
          where: { id: companyId },
          data: { contactPhone: formatted },
        }).catch(() => null);
      }
    }

    // 1. Delegate directly to the persistent companion service
    const companionHost = await getCompanionHost();
    if (companionHost) {
      try {
        if (mode === "code") {
          const targetPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
          const remoteRes = await fetch(`${companionHost}/api/${targetId}/pair-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: targetPhone }),
            cache: "no-store",
          });
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            return NextResponse.json(remoteData);
          }
        } else {
          const remoteRes = await fetch(`${companionHost}/api/${targetId}/qr`, { cache: "no-store" });
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

    const authDir = path.join(os.tmpdir(), "allota_wa", `wa_${targetId}`);
    
    // Clean socket if already running
    const existing = activeSockets.get(targetId);
    if (existing?.sock) {
      try { existing.sock.end(undefined); } catch {}
      activeSockets.delete(targetId);
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

    activeSockets.set(targetId, currentSocketRecord);

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      if (sock.authState.creds.registered && !isEmployee) {
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

        if (!isEmployee) {
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

  const isEmployee = session.role === "EMPLOYEE";
  if (isEmployee) {
    const isKesrox = await verifyKesroxAccess(session, companyId);
    if (!isKesrox) {
      return NextResponse.json(
        { status: "NOT_CONNECTED", phone: null, disabled: true, reason: "Kesrox only" }
      );
    }
  }

  const targetId = isEmployee && session.employeeId ? `emp_${session.employeeId}` : companyId;

  // 1. Delegate directly to the persistent companion service
  const companionHost = await getCompanionHost();
  if (companionHost) {
    try {
      const remoteRes = await fetch(`${companionHost}/api/${targetId}/status`, { cache: "no-store" });
      if (remoteRes.ok) {
        const remoteData = await remoteRes.json();
        if (remoteData.status === "CONNECTED") {
          if (!isEmployee) {
            try {
              await prisma.companySettings.updateMany({
                where: { companyId },
                data: {
                  whatsappConnected: true,
                  whatsappCompanionPhone: remoteData.phone,
                },
              });
            } catch {}
          }
          return NextResponse.json({
            status: "CONNECTED",
            phone: remoteData.phone,
          });
        }

        // When companion service is active, it is the sole source of truth for live sockets.
        // Never fall through to stale DB records that falsely report CONNECTED.
        if (remoteData.status === "AWAITING_SCAN") {
          let qrCode: string | null = null;
          try {
            const qrRes = await fetch(`${companionHost}/api/${targetId}/qr`, { cache: "no-store" });
            if (qrRes.ok) {
              const qrData = await qrRes.json();
              qrCode = qrData.qrCode || null;
            }
          } catch {}
          return NextResponse.json({
            status: "AWAITING_SCAN",
            qrCode,
            phone: null,
          });
        }

        return NextResponse.json({
          status: remoteData.status || "NOT_CONNECTED",
          phone: null,
        });
      }
    } catch {}
  }

  const current = activeSockets.get(targetId);

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

  // 2. Check persisted credentials on disk
  const authDirs = getAuthDirs(targetId);
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

  // 3. Fallback to PostgreSQL database for company admin
  if (!isSaved && !isEmployee) {
    try {
      const settings = await prisma.companySettings.findFirst({
        where: { companyId },
        select: {
          whatsappConnected: true,
          whatsappCompanionPhone: true,
          whatsappCompanionCreds: true,
        },
      });

      if (settings?.whatsappConnected && settings?.whatsappCompanionCreds) {
        try {
          const decryptedCreds = JSON.parse(settings.whatsappCompanionCreds, BufferJSON.reviver);
          if (decryptedCreds?.registered && decryptedCreds?.me?.id) {
            isSaved = true;
            savedPhone = decryptedCreds.me.id.split(":")[0];
          }
        } catch {}
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

  const isEmployee = session.role === "EMPLOYEE";
  const targetId = isEmployee && session.employeeId ? `emp_${session.employeeId}` : companyId;

  const companionHost = await getCompanionHost();
  if (companionHost) {
    try {
      await fetch(`${companionHost}/api/${targetId}/disconnect`, { method: "POST" });
    } catch {}
  }

  const current = activeSockets.get(targetId);

  if (current?.sock) {
    try {
      current.sock.end(undefined);
    } catch {}
  }
  activeSockets.delete(targetId);

  if (!isEmployee) {
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
  }

  const authDirs = getAuthDirs(targetId);
  for (const dir of authDirs) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }

  return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
}
