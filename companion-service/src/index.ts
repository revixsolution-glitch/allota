import express from "express";
import cors from "cors";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import path from "node:path";
import fs from "node:fs";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const ALLOTA_WEBHOOK_URL = process.env.ALLOTA_WEBHOOK_URL || "https://allota.vercel.app/api/whatsapp-companion/incoming";
const SAVI_PHONE = process.env.SAVI_PHONE || "917889107964";
const BASE_AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), "data", "wa_auth");

if (!fs.existsSync(BASE_AUTH_DIR)) {
  fs.mkdirSync(BASE_AUTH_DIR, { recursive: true });
}

interface TenantSession {
  companyId: string;
  sock: any;
  status: "NOT_CONNECTED" | "AWAITING_SCAN" | "CONNECTED" | "ERROR";
  qrDataUrl: string | null;
  phone: string | null;
  authDir: string;
}

// STRICT TENANT ISOLATION: Each companyId has its own completely separate WhatsApp socket and storage
const tenantSessions = new Map<string, TenantSession>();

const AD_KEYWORDS = [
  "pcd",
  "franchise",
  "product list",
  "pricing",
  "rate list",
  "catalog",
  "catalogue",
  "monopoly",
  "distributor",
  "distributorship",
  "pharma",
  "remedies",
  "interested",
  "inquiry",
  "enquiry",
  "order",
  "medicine",
  "sample",
];

function sanitizeCompanyId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

function getOrCreateTenantSession(companyId: string): TenantSession {
  const cleanId = sanitizeCompanyId(companyId);
  let session = tenantSessions.get(cleanId);
  if (!session) {
    const authDir = path.join(BASE_AUTH_DIR, `comp_${cleanId}`);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    session = {
      companyId: cleanId,
      sock: null,
      status: "NOT_CONNECTED",
      qrDataUrl: null,
      phone: null,
      authDir,
    };
    tenantSessions.set(cleanId, session);
  }
  return session;
}

async function startTenantSocket(companyId: string): Promise<TenantSession> {
  const session = getOrCreateTenantSession(companyId);

  // Close existing socket if open
  if (session.sock) {
    try {
      session.sock.end(undefined);
    } catch {}
    session.sock = null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1043857760] as [number, number, number],
    }));

    console.log(`[Companion][Company: ${session.companyId}] Initializing protocol v${version.join(".")}`);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }) as any,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 15000,
      connectTimeoutMs: 60000,
    });

    session.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, { width: 380, margin: 2 });
          session.status = "AWAITING_SCAN";
          console.log(`[Companion][Company: ${session.companyId}] QR code ready.`);
        } catch (e) {
          console.error("QR render error:", e);
        }
      }

      if (connection === "open") {
        session.phone = sock.user?.id ? sock.user.id.split(":")[0] : "Connected";
        session.status = "CONNECTED";
        session.qrDataUrl = null;
        console.log(`[Companion][Company: ${session.companyId}] 🎉 CONNECTED as: +${session.phone}`);
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[Companion][Company: ${session.companyId}] Closed with status: ${statusCode}`);
        session.status = statusCode === DisconnectReason.loggedOut ? "NOT_CONNECTED" : "AWAITING_SCAN";
        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(session.authDir, { recursive: true, force: true });
            fs.mkdirSync(session.authDir, { recursive: true });
          } catch {}
          session.phone = null;
          session.sock = null;
        } else {
          // Reconnect automatically on network blip
          setTimeout(() => startTenantSocket(session.companyId), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        const jid = msg.key.remoteJid || "";

        // Privacy rules: ignore groups, status, outbound
        if (jid.endsWith("@g.us") || jid.includes("@broadcast") || msg.key.fromMe) continue;

        const rawText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          "";

        const cleanText = rawText.trim().toLowerCase();
        if (!cleanText) continue;

        const contextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo;
        const hasAdReferral = Boolean(contextInfo?.externalAdReply);
        const matchesIntent = AD_KEYWORDS.some((kw) => cleanText.includes(kw));

        if (!hasAdReferral && !matchesIntent) {
          // Privacy Guard: skip personal chats
          continue;
        }

        const senderPhone = jid.replace(/@s\.whatsapp\.net/, "");
        const senderName = msg.pushName || "Prospect Lead";

        console.log(`[Lead Detected][Company: ${session.companyId}] Prospect: ${senderName} (+${senderPhone})`);

        // 1. Ingest into Allota CRM strictly for this company
        try {
          await fetch(ALLOTA_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: session.companyId,
              senderPhone: `+${senderPhone}`,
              senderName,
              messageText: rawText,
              isFromMe: false,
              isGroup: false,
              hasAdReferral,
            }),
          });
          console.log(`[Lead Ingested] Saved to Allota CRM for ${session.companyId}.`);
        } catch (e: any) {
          console.warn("[CRM Ingest Error]", e?.message);
        }

        // 2. Forward to Savi on WhatsApp if configured
        try {
          const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
          const forwardText =
`🚨 *NEW PCD FRANCHISE LEAD*

👤 *Prospect:* ${senderName}
📞 *Phone:* +${senderPhone}
💬 *Inquiry:* "${rawText}"
⚡ *Source:* ${hasAdReferral ? "Meta Ad Click" : "Direct WhatsApp Inquiry"}
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

          await sock.sendMessage(saviJid, { text: forwardText });
          console.log(`[Lead Forwarded] Sent to Savi (+${SAVI_PHONE})`);
        } catch (fwdErr: any) {
          console.warn("[Forward Error]", fwdErr?.message);
        }
      }
    });

    return session;
  } catch (err: any) {
    console.error(`[Companion Init Error][Company: ${session.companyId}]`, err);
    session.status = "ERROR";
    return session;
  }
}

// Restore saved sessions on boot
function restoreAllSavedSessions() {
  if (!fs.existsSync(BASE_AUTH_DIR)) return;
  const entries = fs.readdirSync(BASE_AUTH_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("comp_")) {
      const companyId = entry.name.replace(/^comp_/, "");
      const credsPath = path.join(BASE_AUTH_DIR, entry.name, "creds.json");
      if (fs.existsSync(credsPath)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
          if (creds?.registered && creds?.me?.id) {
            console.log(`[Boot] Restoring active session for company: ${companyId}`);
            startTenantSocket(companyId);
          }
        } catch {}
      }
    }
  }
}

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    activeTenants: Array.from(tenantSessions.keys()),
  });
});

// TENANT-SPECIFIC ENDPOINTS
app.get("/api/:companyId/status", (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);
  if (!session) {
    return res.json({ status: "NOT_CONNECTED", phone: null });
  }
  res.json({
    status: session.status,
    phone: session.phone,
  });
});

app.get("/api/:companyId/qr", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  let session = tenantSessions.get(cleanId);

  if (!session || session.status === "NOT_CONNECTED" || session.status === "ERROR") {
    session = await startTenantSocket(cleanId);
  }

  // Wait briefly for QR if starting
  let waited = 0;
  while (!session.qrDataUrl && session.status === "AWAITING_SCAN" && waited < 4000) {
    await new Promise((r) => setTimeout(r, 250));
    waited += 250;
  }

  res.json({
    status: session.status,
    qrCode: session.qrDataUrl,
    phone: session.phone,
  });
});

app.post("/api/:companyId/connect", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = await startTenantSocket(cleanId);
  res.json({ success: true, status: session.status });
});

app.post("/api/:companyId/disconnect", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);
  if (session?.sock) {
    try {
      session.sock.end(undefined);
    } catch {}
  }
  if (session) {
    try {
      fs.rmSync(session.authDir, { recursive: true, force: true });
    } catch {}
    tenantSessions.delete(cleanId);
  }
  res.json({ success: true, status: "NOT_CONNECTED" });
});

app.listen(PORT, () => {
  console.log(`🚀 Allota Multi-Tenant WhatsApp Companion Service on port ${PORT}`);
  restoreAllSavedSessions();
});
