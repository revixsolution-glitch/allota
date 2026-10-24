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

const PORT = process.env.PORT || 3001;
const ALLOTA_WEBHOOK_URL = process.env.ALLOTA_WEBHOOK_URL || "https://allota.vercel.app/api/whatsapp-companion/incoming";
const SAVI_PHONE = process.env.SAVI_PHONE || "917889107964";
const AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), "data", "wa_auth");

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock: any = null;
let currentStatus: "NOT_CONNECTED" | "AWAITING_SCAN" | "CONNECTED" | "ERROR" = "NOT_CONNECTED";
let currentQrDataUrl: string | null = null;
let connectedPhone: string | null = null;

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

async function startWhatsAppSocket() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1043857760] as [number, number, number],
    }));

    console.log(`[Companion] Initializing Baileys with protocol v${version.join(".")}`);

    sock = makeWASocket({
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

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { width: 380, margin: 2 });
          currentStatus = "AWAITING_SCAN";
          console.log("[Companion] Fresh QR code ready for scan.");
        } catch (e) {
          console.error("QR render error:", e);
        }
      }

      if (connection === "open") {
        connectedPhone = sock.user?.id ? sock.user.id.split(":")[0] : "Connected";
        currentStatus = "CONNECTED";
        currentQrDataUrl = null;
        console.log(`[Companion] 🎉 CONNECTED SUCCESSFULLY as: +${connectedPhone}`);
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[Companion] Connection closed. StatusCode: ${statusCode}`);
        currentStatus = statusCode === DisconnectReason.loggedOut ? "NOT_CONNECTED" : "AWAITING_SCAN";
        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch {}
          connectedPhone = null;
        } else {
          // Reconnect automatically on network blip
          setTimeout(startWhatsAppSocket, 3000);
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

        console.log(`[Lead Detected] Prospect: ${senderName} (+${senderPhone})`);

        // 1. Ingest into Allota CRM
        try {
          await fetch(ALLOTA_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: process.env.COMPANY_ID || "default",
              senderPhone: `+${senderPhone}`,
              senderName,
              messageText: rawText,
              isFromMe: false,
              isGroup: false,
              hasAdReferral,
            }),
          });
          console.log(`[Lead Ingested] Saved to Allota CRM.`);
        } catch (e: any) {
          console.warn("[CRM Ingest Error]", e?.message);
        }

        // 2. Forward to Savi on WhatsApp
        try {
          const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
          const forwardText =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

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
  } catch (err: any) {
    console.error("[Companion Init Error]", err);
    currentStatus = "ERROR";
  }
}

// REST API for Allota CRM Frontend
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), waStatus: currentStatus });
});

app.get("/api/qr", (req, res) => {
  res.json({
    status: currentStatus,
    qrCode: currentQrDataUrl,
    phone: connectedPhone,
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: currentStatus,
    phone: connectedPhone,
  });
});

app.post("/api/connect", async (req, res) => {
  if (currentStatus !== "CONNECTED") {
    await startWhatsAppSocket();
  }
  res.json({ success: true, status: currentStatus });
});

app.post("/api/disconnect", async (req, res) => {
  if (sock) {
    try { sock.end(undefined); } catch {}
  }
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {}
  currentStatus = "NOT_CONNECTED";
  currentQrDataUrl = null;
  connectedPhone = null;
  res.json({ success: true, status: "NOT_CONNECTED" });
});

app.listen(PORT, () => {
  console.log(`🚀 Allota WhatsApp Companion Service listening on port ${PORT}`);
  // Start socket listener automatically on boot
  startWhatsAppSocket();
});
