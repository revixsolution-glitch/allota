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

interface ActiveLidLead {
  companyId: string;
  senderName: string;
  initialInquiry: string;
  firstSeenAt: Date;
  promptSent: boolean;
  resolvedPhone?: string;
}

// In-memory tracker for active Meta Ad / LID leads awaiting callable phone numbers
const activeLidLeads = new Map<string, ActiveLidLead>();

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

function getSessionFilesMap(authDir: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!fs.existsSync(authDir)) return map;
  const files = fs.readdirSync(authDir);
  for (const f of files) {
    const full = path.join(authDir, f);
    if (fs.statSync(full).isFile() && f.endsWith(".json")) {
      map[f] = fs.readFileSync(full, "utf8");
    }
  }
  return map;
}

function restoreSessionFilesFromMap(authDir: string, rawData: any) {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  let map: Record<string, any> = {};
  if (typeof rawData === "string") {
    try {
      map = JSON.parse(rawData);
    } catch {
      return;
    }
  } else if (typeof rawData === "object" && rawData !== null) {
    map = rawData;
  }

  // Handle single creds.json object (legacy)
  if (map.me || map.registrationId || map.noiseKey) {
    fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify(map), "utf8");
    return;
  }

  // Restore every key and pre-key JSON file
  for (const [filename, content] of Object.entries(map)) {
    if (typeof filename === "string" && filename.endsWith(".json")) {
      fs.writeFileSync(
        path.join(authDir, filename),
        typeof content === "string" ? content : JSON.stringify(content),
        "utf8"
      );
    }
  }
}

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

  // PERMANENT ZERO-STALE GUARD: If session is not fully registered and authenticated,
  // automatically purge any leftover partial pre-keys so WhatsApp gets a 100% pristine cryptographic handshake.
  if (fs.existsSync(session.authDir)) {
    const credsPath = path.join(session.authDir, "creds.json");
    let isFullyRegistered = false;
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
        isFullyRegistered = Boolean(creds?.registered && creds?.me?.id);
      } catch {}
    }
    if (!isFullyRegistered) {
      try {
        fs.rmSync(session.authDir, { recursive: true, force: true });
        fs.mkdirSync(session.authDir, { recursive: true });
      } catch {}
    }
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
      browser: ["Mac OS", "Chrome", "130.0.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 15000,
      connectTimeoutMs: 60000,
    });

    session.sock = sock;

    const backupSessionToVault = async () => {
      if (!sock?.authState?.creds?.registered) return;
      try {
        const sessionMap = getSessionFilesMap(session.authDir);
        await fetch(ALLOTA_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "BACKUP_CREDS",
            companyId: session.companyId,
            phone: session.phone || sock.authState.creds.me?.id?.split(":")[0],
            sessionMap,
          }),
        });
        console.log(`[Creds Vault] Full session backed up to PostgreSQL for ${session.companyId} (${Object.keys(sessionMap).length} files)`);
      } catch (e: any) {
        console.warn("[Creds Backup Warning]", e?.message);
      }
    };

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await backupSessionToVault();
    });

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
        await backupSessionToVault();
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[Companion][Company: ${session.companyId}] Closed with status: ${statusCode}`);
        const isRegistered = Boolean(sock?.authState?.creds?.registered);

        if (statusCode === DisconnectReason.loggedOut || !isRegistered) {
          // If unauthenticated or explicitly logged out: clean wipe completely
          try {
            fs.rmSync(session.authDir, { recursive: true, force: true });
            fs.mkdirSync(session.authDir, { recursive: true });
          } catch {}
          session.phone = null;
          session.sock = null;
          session.status = "NOT_CONNECTED";
        } else {
          // Genuine registered connection that dropped on network blip: auto-reconnect
          session.status = "AWAITING_SCAN";
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

        const isKesrox =
          session.companyId.includes("kesrox") ||
          session.companyId === "cmub4ssdx00000u8oqlqc62e0" ||
          session.companyId === "cmubi8zf6000004l8y45hhuds" ||
          session.phone?.includes("7494809665");

        const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;

        // 1. REVERSE LOOKUP / ONGOING CONVERSATION: Check if this is an answer from a prospect awaiting real phone number
        if (activeLidLeads.has(jid)) {
          const lead = activeLidLeads.get(jid)!;
          const phoneMatch = rawText.match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/);

          if (phoneMatch) {
            const clean10 = phoneMatch[1];
            const realPhone = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5)}`;
            lead.resolvedPhone = realPhone;

            console.log(`[Real Phone Captured] Prospect ${lead.senderName} (${jid}) provided callable number: ${realPhone}`);

            // A. Update Allota CRM with the real phone number
            try {
              await fetch(ALLOTA_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  companyId: session.companyId,
                  senderPhone: realPhone,
                  senderName: lead.senderName,
                  messageText: `[Real Phone Provided]: ${rawText}\n[Initial Inquiry]: ${lead.initialInquiry}`,
                  isFromMe: false,
                  isGroup: false,
                  hasAdReferral: true,
                  lidJid: jid,
                }),
              });
              console.log(`[CRM Upgraded] Lead ${lead.senderName} upgraded to real phone: ${realPhone}`);
            } catch (err: any) {
              console.warn("[CRM Real Phone Update Error]", err?.message);
            }

            // B. High-Priority Direct Alert to Savi with 1-tap call & WhatsApp links
            if (isKesrox && session.sock) {
              try {
                const verifiedText =
`🎯 *REAL CALLABLE NUMBER RECEIVED (KESROX)*

👤 *Prospect:* ${lead.senderName}
📞 *Real Phone:* ${realPhone}
💬 *Prospect Reply:* "${rawText}"
⚡ *Source:* Meta Ad Lead
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${clean10}
👉 *Click to WhatsApp:* https://wa.me/91${clean10}`;

                await session.sock.sendMessage(saviJid, { text: verifiedText });
                console.log(`[Lead Real Phone Dispatched] Sent callable phone ${realPhone} to Savi`);
              } catch (fwdErr: any) {
                console.warn("[Forward Real Phone Error]", fwdErr?.message);
              }
            }

            // C. Courteous acknowledgment to the prospect on WhatsApp
            try {
              await session.sock.sendMessage(jid, {
                text: `Dhanyavaad ${lead.senderName}! 🙏 We have received your contact number (${realPhone}). Our team will connect with you shortly.`
              });
            } catch {}

            continue;
          } else {
            // Prospect replied with text without a phone number (e.g. city name or inquiry)
            console.log(`[Follow-up from LID Lead][${lead.senderName}]: ${rawText}`);
            if (isKesrox && session.sock) {
              try {
                const replyNotice =
`💬 *PROSPECT REPLY UPDATE (KESROX)*

👤 *Prospect:* ${lead.senderName}
💬 *Message:* "${rawText}"
⏳ *Status:* Still awaiting 10-digit mobile number.
👉 *Chat on Kesrox Phone:* Search "${lead.senderName}" in WhatsApp`;

                await session.sock.sendMessage(saviJid, { text: replyNotice });
              } catch {}
            }
            continue;
          }
        }

        // 2. NEW INCOMING INQUIRY: Privacy firewall guard
        const contextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo;
        const hasAdReferral = Boolean(contextInfo?.externalAdReply);
        const matchesIntent = AD_KEYWORDS.some((kw) => cleanText.includes(kw));

        if (!hasAdReferral && !matchesIntent) {
          // Privacy Guard: skip personal chats
          continue;
        }

        const senderName = msg.pushName || "Prospect Lead";

        // Check if message text or non-LID JID directly yields a 10-digit Indian phone
        const textPhoneMatch = rawText.match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/);
        let realNumber: string | null = null;
        if (textPhoneMatch) {
          realNumber = textPhoneMatch[1];
        } else if (!jid.endsWith("@lid") && jid.includes("@s.whatsapp.net")) {
          const directPhone = jid.replace(/\D/g, "");
          if (directPhone.startsWith("91") && directPhone.length === 12) {
            realNumber = directPhone.slice(2);
          }
        }

        if (realNumber) {
          // SCENARIO A: REAL NUMBER KNOWN IMMEDIATELY
          const formattedPhone = `+91 ${realNumber.slice(0, 5)} ${realNumber.slice(5)}`;
          console.log(`[Lead Detected with Real Phone][Company: ${session.companyId}] ${senderName} (${formattedPhone})`);

          // 1. Ingest into CRM
          try {
            await fetch(ALLOTA_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: session.companyId,
                senderPhone: formattedPhone,
                senderName,
                messageText: rawText,
                isFromMe: false,
                isGroup: false,
                hasAdReferral,
                lidJid: jid,
              }),
            });
          } catch (e: any) {
            console.warn("[CRM Ingest Error]", e?.message);
          }

          // 2. Forward to Savi with 1-tap call & WhatsApp links
          if (isKesrox && session.sock) {
            try {
              const forwardText =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Real Phone:* ${formattedPhone}
💬 *Inquiry:* "${rawText}"
⚡ *Source:* ${hasAdReferral ? "Meta Ad Click" : "Direct WhatsApp Inquiry"}
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${realNumber}
👉 *Click to WhatsApp:* https://wa.me/91${realNumber}`;

              await session.sock.sendMessage(saviJid, { text: forwardText });
              console.log(`[Lead Forwarded] Sent real phone ${formattedPhone} to Savi for Kesrox`);
            } catch (fwdErr: any) {
              console.warn("[Forward Error]", fwdErr?.message);
            }
          }
        } else {
          // SCENARIO B: MASKED META AD LID — Instant Polite Auto-Prompt to Retrieve Number
          console.log(`[Meta Ad Lead Masked][Company: ${session.companyId}] ${senderName} (${jid}) — Auto-prompting for mobile number...`);

          // Register in tracker
          activeLidLeads.set(jid, {
            companyId: session.companyId,
            senderName,
            initialInquiry: rawText,
            firstSeenAt: new Date(),
            promptSent: true,
          });

          // 1. Save preliminary lead in CRM
          try {
            await fetch(ALLOTA_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: session.companyId,
                senderPhone: `Awaiting Phone (${senderName})`,
                senderName,
                messageText: rawText,
                isFromMe: false,
                isGroup: false,
                hasAdReferral,
                lidJid: jid,
              }),
            });
          } catch (e: any) {
            console.warn("[CRM Ingest Preliminary Error]", e?.message);
          }

          // 2. Send instant polite qualification auto-reply to prospect
          if (session.sock) {
            try {
              const autoPrompt =
`Namaste ${senderName}! 🙏

Thank you for reaching out to *Kesrox Healthcare* for PCD Pharma Franchise.

To share our complete *Product Catalogue, Monopoly Price List & Territory Vacancies* with you, please reply with your:
1. 📱 *Calling / WhatsApp Mobile Number*
2. 📍 *City & State*

Our Director will assist you right away!`;

              await session.sock.sendMessage(jid, { text: autoPrompt });
              console.log(`[Auto-Prompt Sent] Asked prospect ${senderName} for real mobile number.`);
            } catch (pErr: any) {
              console.warn("[Auto-Prompt Send Error]", pErr?.message);
            }
          }

          // 3. Forward clear status to Savi WITHOUT any fake/masked numbers
          if (isKesrox && session.sock) {
            try {
              const initialNotice =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Phone:* ⏳ *Awaiting Prospect's Mobile No.*
💬 *Inquiry:* "${rawText}"
⚡ *Source:* Meta Ad Click
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
🤖 *Bot Action:* Instant auto-reply sent requesting mobile number & city. The moment they reply, real callable number will land here!
👉 *Kesrox WhatsApp:* Open WhatsApp on Kesrox Phone ➔ Chat "${senderName}"`;

              await session.sock.sendMessage(saviJid, { text: initialNotice });
              console.log(`[Lead Forwarded] Sent initial awaiting-phone notice to Savi for Kesrox`);
            } catch (fwdErr: any) {
              console.warn("[Forward Error]", fwdErr?.message);
            }
          }
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

// Restore saved sessions on boot from disk and PostgreSQL vault
async function restoreAllSavedSessions() {
  // 1. Check local disk
  if (fs.existsSync(BASE_AUTH_DIR)) {
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
              await startTenantSocket(companyId);
            }
          } catch {}
        }
      }
    }
  }

  // 2. Hydrate from PostgreSQL database via Allota API
  try {
    const res = await fetch(ALLOTA_WEBHOOK_URL);
    if (res.ok) {
      const data = await res.json();
      if (data?.tenants && Array.isArray(data.tenants)) {
        for (const t of data.tenants) {
          if (t.companyId && t.whatsappCompanionCreds) {
            const session = getOrCreateTenantSession(t.companyId);
            restoreSessionFilesFromMap(session.authDir, t.whatsappCompanionCreds);
            console.log(`[Boot] Restored full PostgreSQL session keys for company: ${t.companyId}`);
            await startTenantSocket(t.companyId);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn("[Boot Hydrate Warning]", e?.message);
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

// Official 8-Digit Pairing Code generation (Phone-based linking without camera QR scan)
app.post("/api/:companyId/pair-code", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const rawPhone = req.body?.phone || req.query?.phone || "917494809665";
  const cleanPhone = String(rawPhone).replace(/\D/g, "");
  const fullPhone = cleanPhone.startsWith("91") && cleanPhone.length === 12 ? cleanPhone : `91${cleanPhone}`;

  if (fullPhone.length < 10) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }

  let session = tenantSessions.get(cleanId);
  if (!session || !session.sock || session.status === "NOT_CONNECTED") {
    session = await startTenantSocket(cleanId);
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (session.sock?.authState?.creds?.registered) {
    return res.json({
      success: true,
      alreadyRegistered: true,
      status: "CONNECTED",
      phone: session.phone || fullPhone,
    });
  }

  try {
    const pairingCode = await session.sock.requestPairingCode(fullPhone);
    console.log(`[Companion][Company: ${cleanId}] 8-digit pairing code issued for ${fullPhone}: ${pairingCode}`);
    return res.json({
      success: true,
      pairingCode,
      phone: fullPhone,
      status: "AWAITING_PAIRING_CODE",
    });
  } catch (err: any) {
    console.error("Pairing code error:", err);
    return res.status(500).json({ error: err?.message || "Failed to generate pairing code" });
  }
});

// Trigger a live test lead for verification
app.post("/api/:companyId/test-lead", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);

  if (!session || !session.sock || session.status !== "CONNECTED") {
    return res.status(400).json({ error: "WhatsApp is not connected for this company" });
  }

  const senderName = "Dr. Rajesh Sharma (PCD Test Lead)";
  const senderPhone = "919876543210";
  const rawText = "Namaste, I saw your Meta Ad. Interested in Kesrox PCD Pharma franchise monopoly rights and product catalogue for Ambala district.";

  // 1. Ingest into Allota CRM
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
        hasAdReferral: true,
      }),
    });
    console.log(`[Test Lead Ingested] Saved to Allota CRM for ${session.companyId}`);
  } catch (e: any) {
    console.warn("CRM test error:", e?.message);
  }

  // 2. Forward to Savi on WhatsApp
  try {
    const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
    const forwardText =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Phone:* +${senderPhone}
💬 *Inquiry:* "${rawText}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (Test Lead)
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

    await session.sock.sendMessage(saviJid, { text: forwardText });
    console.log(`[Test Lead Forwarded] Successfully sent via WhatsApp to Savi (+${SAVI_PHONE})!`);

    return res.json({
      success: true,
      forwardedTo: `+${SAVI_PHONE}`,
      lead: { name: senderName, phone: senderPhone, inquiry: rawText },
    });
  } catch (err: any) {
    console.error("Failed to forward test message to Savi:", err);
    return res.status(500).json({ error: err?.message || "Failed to send WhatsApp message" });
  }
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

  // 24/7 KEEP-ALIVE WATCHDOG & SELF-PING
  const RENDER_PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || "https://allota-whatsapp-companion.onrender.com";

  // 1. High-frequency self-ping every 3 minutes to keep Render Free Tier 100% awake 24/7
  setInterval(async () => {
    try {
      const res = await fetch(`${RENDER_PUBLIC_URL}/health`);
      if (res.ok) {
        console.log(`[Keep-Alive] 24/7 Self-ping OK at ${new Date().toLocaleTimeString("en-IN")}`);
      }
    } catch (err: any) {
      console.warn(`[Keep-Alive Warning]`, err?.message);
    }
  }, 3 * 60 * 1000);

  // 2. Health Watchdog every 2 minutes: ensures any registered socket that dropped gets auto-reconnected
  setInterval(async () => {
    for (const [companyId, session] of tenantSessions.entries()) {
      if (session.status !== "CONNECTED" && fs.existsSync(path.join(session.authDir, "creds.json"))) {
        try {
          const creds = JSON.parse(fs.readFileSync(path.join(session.authDir, "creds.json"), "utf8"));
          if (creds?.registered && creds?.me?.id) {
            console.log(`[Watchdog] Auto-reconnecting dropped session for company: ${companyId}`);
            await startTenantSocket(companyId);
          }
        } catch {}
      }
    }
  }, 2 * 60 * 1000);
});
