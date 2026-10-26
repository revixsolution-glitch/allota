import express from "express";
import cors from "cors";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
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

// In-memory cache for message retry decryption (prevents "Waiting for this message")
const messageMemoryCache = new Map<string, proto.IMessage>();

export async function sendAndCacheMessage(sock: any, jid: string, content: any) {
  const sent = await sock.sendMessage(jid, content);
  if (sent?.key?.id && sent?.message) {
    messageMemoryCache.set(sent.key.id, sent.message);
    if (messageMemoryCache.size > 2000) {
      const firstKey = messageMemoryCache.keys().next().value;
      if (firstKey) messageMemoryCache.delete(firstKey);
    }
  }
  return sent;
}

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
  lastDisconnectCode?: number;
  lastError?: string;
  lastConnectedAt?: Date;
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

// Direct cache mapping WhatsApp LIDs to real phone numbers synced from the device
const lidToPnMap = new Map<string, string>();

async function handleRealPhoneCaptured(
  session: TenantSession,
  lidJid: string,
  rawPhone: string,
  sourceNote: string
) {
  const digits = rawPhone.replace(/\D/g, "");
  const clean10 = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits.slice(-10);
  if (clean10.length !== 10) return;

  const realPhone = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5)}`;
  lidToPnMap.set(lidJid, `91${clean10}`);

  const lead = activeLidLeads.get(lidJid);
  const senderName = lead?.senderName || "WhatsApp Prospect";

  console.log(`[Real Phone Captured via ${sourceNote}][Company: ${session.companyId}] ${senderName} (${lidJid}) -> ${realPhone}`);

  // 1. Update Allota CRM with the real callable phone number
  try {
    await fetch(ALLOTA_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: session.companyId,
        senderPhone: realPhone,
        senderName,
        messageText: `[Real Phone Disclosed via ${sourceNote}]: ${realPhone}\n[Inquiry]: ${lead?.initialInquiry || "Ad Lead"}`,
        isFromMe: false,
        isGroup: false,
        hasAdReferral: true,
        lidJid,
      }),
    });
    console.log(`[CRM Upgraded] Lead ${senderName} updated with callable phone: ${realPhone}`);
  } catch (err: any) {
    console.warn("[CRM Real Phone Update Error]", err?.message);
  }

  // 2. High-priority dispatch to Savi on WhatsApp
  const isKesrox =
    session.companyId.includes("kesrox") ||
    session.companyId === "cmub4ssdx00000u8oqlqc62e0" ||
    session.companyId === "cmubi8zf6000004l8y45hhuds" ||
    session.phone?.includes("7494809665");

  if (isKesrox && session.sock) {
    try {
      const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
      const verifiedText =
`🎯 *REAL CALLABLE NUMBER RECEIVED (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Real Phone:* ${realPhone}
⚡ *Source:* ${sourceNote}
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${clean10}
👉 *Click to WhatsApp:* https://wa.me/91${clean10}`;

      await sendAndCacheMessage(session.sock, saviJid, { text: verifiedText });
      console.log(`[Lead Real Phone Dispatched] Sent ${realPhone} to Savi for Kesrox`);
    } catch (fwdErr: any) {
      console.warn("[Forward Real Phone Error]", fwdErr?.message);
    }
  }

  if (lead) {
    lead.resolvedPhone = realPhone;
  }
}

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
  "kesrox",
  "third party",
  "third-party",
  "3rd party",
  "manufacturing",
  "monthly qty",
  "qty",
  "quantity",
  "drug licence",
  "drug license",
  "gst",
  "product",
  "quotation",
  "quote",
  "rates",
  "rate",
  "price",
  "batch",
  "tablets",
  "capsules",
  "syrup",
  "injection",
  "dry syrup",
  "ointment",
  "hi",
  "hello",
  "namaste",
  "bhejo",
  "chahiye",
  "details",
  "info",
  "requirements",
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
  const cleanId = sanitizeCompanyId(companyId);

  // Close existing socket cleanly without triggering loop listeners
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners("connection.update");
      session.sock.ev.removeAllListeners("creds.update");
      session.sock.ev.removeAllListeners("messages.upsert");
      session.sock.end(undefined);
    } catch {}
    session.sock = null;
  }

  // 1. Check if authDir already has a registered valid creds.json
  const credsPath = path.join(session.authDir, "creds.json");
  let isFullyRegistered = false;
  if (fs.existsSync(credsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      isFullyRegistered = Boolean(creds?.registered && creds?.me?.id);
    } catch {}
  }

  // 2. If not found on local disk, ALWAYS hydrate from PostgreSQL database vault FIRST!
  if (!isFullyRegistered) {
    try {
      console.log(`[Socket Init] Attempting PostgreSQL session vault restoration for ${cleanId}...`);
      const res = await fetch(ALLOTA_WEBHOOK_URL);
      if (res.ok) {
        const data: any = await res.json();
        const tenant = data?.tenants?.find((t: any) => t.companyId === cleanId);
        if (tenant?.whatsappCompanionCreds) {
          restoreSessionFilesFromMap(session.authDir, tenant.whatsappCompanionCreds);
          if (fs.existsSync(credsPath)) {
            const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
            isFullyRegistered = Boolean(creds?.registered && creds?.me?.id);
            console.log(`[Socket Init] Successfully restored PostgreSQL session keys for ${cleanId}. Registered: ${isFullyRegistered}`);
          }
        }
      }
    } catch (vaultErr: any) {
      console.warn(`[Socket Init Vault Warning]`, vaultErr?.message);
    }
  }

  // Only if after checking Postgres it is still completely unauthenticated/corrupt, clean wipe for fresh scan
  if (!isFullyRegistered && fs.existsSync(session.authDir)) {
    try {
      fs.rmSync(session.authDir, { recursive: true, force: true });
      fs.mkdirSync(session.authDir, { recursive: true });
    } catch {}
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1043857760] as [number, number, number],
    }));

    console.log(`[Companion][Company: ${session.companyId}] Initializing protocol v${version.join(".")}`);

    const sockLogger = pino({ level: "silent" });

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, sockLogger as any),
      },
      printQRInTerminal: false,
      logger: sockLogger as any,
      browser: ["Mac OS", "Chrome", "130.0.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 15000,
      connectTimeoutMs: 60000,
      getMessage: async (key) => {
        if (key.id && messageMemoryCache.has(key.id)) {
          return messageMemoryCache.get(key.id);
        }
        return undefined;
      },
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
      if (session.sock !== sock) return; // Ignore events from old superseded sockets
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
        session.lastConnectedAt = new Date();
        session.lastError = undefined;
        session.lastDisconnectCode = undefined;
        console.log(`[Companion][Company: ${session.companyId}] 🎉 CONNECTED as: +${session.phone}`);
        await backupSessionToVault();
      } else if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        session.lastDisconnectCode = statusCode;
        session.lastError = (lastDisconnect?.error as any)?.message || `Closed with code ${statusCode}`;
        console.log(`[Companion][Company: ${session.companyId}] Closed with status: ${statusCode} - ${session.lastError}`);
        const isRegistered = Boolean(sock?.authState?.creds?.registered);

        if (statusCode === DisconnectReason.loggedOut) {
          // If explicitly logged out from device settings: clean wipe
          console.log(`[Companion][Company: ${session.companyId}] Explicitly logged out from device.`);
          try {
            fs.rmSync(session.authDir, { recursive: true, force: true });
            fs.mkdirSync(session.authDir, { recursive: true });
          } catch {}
          session.phone = null;
          session.sock = null;
          session.status = "NOT_CONNECTED";
        } else {
          // Registered connection dropped due to network blip / server deploy: auto-reconnect
          session.status = "NOT_CONNECTED";
          console.log(`[Companion][Company: ${session.companyId}] Network drop (code: ${statusCode}). Auto-reconnecting in 3s...`);
          setTimeout(() => startTenantSocket(session.companyId), 3000);
        }
      }
    });

    // Direct device sync listeners to catch real phone numbers as WhatsApp syncs them from primary phone
    sock.ev.on("chats.phoneNumberShare", async ({ lid, jid }: any) => {
      console.log(`[WhatsApp Device Event: chats.phoneNumberShare] LID ${lid} -> PN ${jid}`);
      const cleanPhone = String(jid || "").replace(/\D/g, "");
      if (cleanPhone.length >= 10) {
        await handleRealPhoneCaptured(session, lid, cleanPhone, "WhatsApp Native Device Share");
      }
    });

    sock.ev.on("contacts.upsert", (contacts: any[]) => {
      for (const c of contacts) {
        if (c.lid && (c.id || c.jid)) {
          const pn = String(c.id || c.jid).replace(/\D/g, "");
          if (pn.length >= 10 && !pn.includes("lid")) {
            lidToPnMap.set(c.lid, pn);
          }
        }
        if (c.phoneNumber) {
          const pn = String(c.phoneNumber).replace(/\D/g, "");
          if (pn.length >= 10) {
            if (c.id) lidToPnMap.set(c.id, pn);
            if (c.lid) lidToPnMap.set(c.lid, pn);
          }
        }
      }
    });

    sock.ev.on("contacts.update", (updates: any[]) => {
      for (const u of updates) {
        if (u.lid && (u.id || u.jid)) {
          const pn = String(u.id || u.jid).replace(/\D/g, "");
          if (pn.length >= 10 && !pn.includes("lid")) {
            lidToPnMap.set(u.lid, pn);
          }
        }
        if (u.phoneNumber) {
          const pn = String(u.phoneNumber).replace(/\D/g, "");
          if (pn.length >= 10) {
            if (u.id) lidToPnMap.set(u.id, pn);
            if (u.lid) lidToPnMap.set(u.lid, pn);
          }
        }
      }
    });

    function detectDivision(rawText: string, contextInfo?: any): {
      division: "THIRD_PARTY" | "PCD_FRANCHISE";
      label: string;
      emoji: string;
      greetingType: string;
      offerDetails: string;
    } {
      const adTitle = contextInfo?.externalAdReply?.title || "";
      const adBody = contextInfo?.externalAdReply?.body || "";
      const combined = `${rawText} ${adTitle} ${adBody}`.toLowerCase();

      const isPcdExplicit =
        combined.includes("pcd") ||
        combined.includes("franchise") ||
        combined.includes("monopoly") ||
        combined.includes("distributor");

      const isThirdPartyExplicit =
        combined.includes("third party") ||
        combined.includes("third-party") ||
        combined.includes("3rd party") ||
        combined.includes("manufacturing") ||
        combined.includes("monthly qty") ||
        combined.includes("batch") ||
        combined.includes("contract") ||
        combined.includes("oem");

      // Since Kesrox active Meta Ad campaign is Third Party Manufacturing,
      // any ad lead unless explicitly asking for PCD franchise monopoly is Third Party Manufacturing
      const isThirdParty = isThirdPartyExplicit || !isPcdExplicit;

      if (isThirdParty) {
        return {
          division: "THIRD_PARTY",
          label: "THIRD-PARTY MANUFACTURING",
          emoji: "🏭",
          greetingType: "Third-Party Pharma Manufacturing",
          offerDetails: "WHO-GMP Manufacturing Approvals, Product List, Batch Sizes & Commercial Quotations",
        };
      } else {
        return {
          division: "PCD_FRANCHISE",
          label: "PCD FRANCHISE",
          emoji: "🏢",
          greetingType: "PCD Pharma Franchise",
          offerDetails: "complete Product Catalogue, Monopoly Price List & Territory Vacancies",
        };
      }
    }

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (!messages || !Array.isArray(messages)) return;
      console.log(`[messages.upsert] Received ${messages.length} message(s), type: ${type}`);

      for (const msg of messages) {
        if (msg.key?.id && msg.message) {
          messageMemoryCache.set(msg.key.id, msg.message);
          if (messageMemoryCache.size > 2000) {
            const firstKey = messageMemoryCache.keys().next().value;
            if (firstKey) messageMemoryCache.delete(firstKey);
          }
        }

        const jid = msg.key.remoteJid || "";

        // Privacy rules: ignore groups, status, outbound
        if (jid.endsWith("@g.us") || jid.includes("@broadcast") || msg.key.fromMe) continue;

        const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
        if (jid === saviJid || jid.includes(SAVI_PHONE.replace(/\D/g, ""))) continue;

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

                await sendAndCacheMessage(session.sock, saviJid, { text: verifiedText });
                console.log(`[Lead Real Phone Dispatched] Sent callable phone ${realPhone} to Savi`);
              } catch (fwdErr: any) {
                console.warn("[Forward Real Phone Error]", fwdErr?.message);
              }
            }

            // C. Courteous acknowledgment to the prospect on WhatsApp
            try {
              await sendAndCacheMessage(session.sock, jid, {
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

                await sendAndCacheMessage(session.sock, saviJid, { text: replyNotice });
              } catch {}
            }
            continue;
          }
        }

        // 2. NEW INCOMING INQUIRY: Strictly filter for Meta Click-to-WhatsApp Ads
        const contextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo ||
          msg.message?.videoMessage?.contextInfo ||
          msg.message?.documentMessage?.contextInfo;
        const hasAdReferral = Boolean(contextInfo?.externalAdReply);

        // Strict Meta Ad detection:
        // Must either carry native Meta Ad referral metadata (externalAdReply / conversionData)
        // OR match the exact prefilled Kesrox Meta Ad campaign template.
        const isMetaAdLead =
          hasAdReferral ||
          Boolean((contextInfo as any)?.entryPointConversionSource) ||
          Boolean((contextInfo as any)?.conversionData) ||
          cleanText.includes("hi kesrox") ||
          cleanText.includes("monthly qty") ||
          cleanText.includes("drug licence") ||
          cleanText.includes("drug license") ||
          cleanText.includes("gst: y/n") ||
          cleanText.includes("gst:y/n") ||
          cleanText.includes("gst : y/n") ||
          (cleanText.includes("product:") && cleanText.includes("qty"));

        if (!isMetaAdLead) {
          // Strictly skip non-Meta personal, vendor, or internal chats as requested by the user
          console.log(`[Skipping Non-Meta Message] from ${jid} (${msg.pushName || "Unknown"}): "${cleanText.slice(0, 40)}"`);
          continue;
        }

        const divMeta = detectDivision(rawText, contextInfo);
        const senderName = msg.pushName || "Prospect Lead";

        // Check 1: Did WhatsApp protocol expose senderPn directly on the message node or key?
        const senderPn =
          (msg.key as any).senderPn ||
          (msg.key as any).participantPn ||
          (msg as any).senderPn ||
          (msg as any).participantPn ||
          (msg as any).pn;
        let realNumber: string | null = null;

        if (senderPn) {
          const cleanPn = String(senderPn).replace(/\D/g, "");
          if (cleanPn.length >= 10) {
            realNumber = cleanPn.startsWith("91") && cleanPn.length === 12 ? cleanPn.slice(2) : cleanPn.slice(-10);
            lidToPnMap.set(jid, `91${realNumber}`);
          }
        }

        // Check 2: Has this LID already been resolved from device contacts/sync?
        if (!realNumber && lidToPnMap.has(jid)) {
          const mappedPn = lidToPnMap.get(jid)!;
          const cleanPn = String(mappedPn).replace(/\D/g, "");
          if (cleanPn.length >= 10) {
            realNumber = cleanPn.startsWith("91") && cleanPn.length === 12 ? cleanPn.slice(2) : cleanPn.slice(-10);
          }
        }

        // Check 3: Is jid directly a phone number (@s.whatsapp.net)?
        if (!realNumber && !jid.endsWith("@lid") && jid.includes("@s.whatsapp.net")) {
          const directPhone = jid.split("@")[0].replace(/\D/g, "");
          if (directPhone.length >= 10) {
            realNumber = directPhone.startsWith("91") && directPhone.length === 12 ? directPhone.slice(2) : directPhone.slice(-10);
            lidToPnMap.set(jid, `91${realNumber}`);
          }
        }

        // Check 4: Check if participant has phone number
        if (!realNumber && (msg.key as any).participant && !(msg.key as any).participant.endsWith("@lid")) {
          const pPhone = (msg.key as any).participant.split("@")[0].replace(/\D/g, "");
          if (pPhone.length >= 10) {
            realNumber = pPhone.startsWith("91") && pPhone.length === 12 ? pPhone.slice(2) : pPhone.slice(-10);
            lidToPnMap.set(jid, `91${realNumber}`);
          }
        }

        // Check 5: Check if message text contains a 10-digit Indian phone number
        if (!realNumber) {
          const textPhoneMatch =
            rawText.match(/(?:(?:\+?91|0)[\s-]?)?([6-9]\d{4}[\s-]?\d{5})\b/) ||
            rawText.match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/);
          if (textPhoneMatch) {
            const clean = textPhoneMatch[1].replace(/\D/g, "");
            if (clean.length === 10) {
              realNumber = clean;
              lidToPnMap.set(jid, `91${realNumber}`);
            }
          }
        }

        // Check 6: Check pushName for phone number
        if (!realNumber && msg.pushName) {
          const pushPhoneMatch =
            msg.pushName.match(/(?:(?:\+?91|0)[\s-]?)?([6-9]\d{4}[\s-]?\d{5})\b/) ||
            msg.pushName.match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/);
          if (pushPhoneMatch) {
            const clean = pushPhoneMatch[1].replace(/\D/g, "");
            if (clean.length === 10) {
              realNumber = clean;
              lidToPnMap.set(jid, `91${realNumber}`);
            }
          }
        }

        if (realNumber) {
          // SCENARIO A: REAL NUMBER KNOWN IMMEDIATELY
          const formattedPhone = `+91 ${realNumber.slice(0, 5)} ${realNumber.slice(5)}`;
          console.log(`[Lead Detected with Real Phone][Company: ${session.companyId}] ${senderName} (${formattedPhone}) - ${divMeta.label}`);

          // 1. Ingest into CRM
          try {
            await fetch(ALLOTA_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: session.companyId,
                senderPhone: formattedPhone,
                senderName,
                division: divMeta.division,
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
`🚨 *NEW ${divMeta.label} LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Real Phone:* ${formattedPhone}
💬 *Inquiry:* "${rawText}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (${divMeta.emoji} ${divMeta.label})
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${realNumber}
👉 *Click to WhatsApp:* https://wa.me/91${realNumber}`;

              await sendAndCacheMessage(session.sock, saviJid, { text: forwardText });
              console.log(`[Lead Forwarded] Sent real phone ${formattedPhone} to Savi for Kesrox (${divMeta.label})`);
            } catch (fwdErr: any) {
              console.warn("[Forward Error]", fwdErr?.message);
            }
          }
        } else {
          // SCENARIO B: MASKED META AD LID
          console.log(`[Meta Ad Lead Masked][Company: ${session.companyId}] ${senderName} (${jid})`);

          // Register in tracker
          activeLidLeads.set(jid, {
            companyId: session.companyId,
            senderName,
            initialInquiry: rawText,
            firstSeenAt: new Date(),
            promptSent: false,
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
                division: divMeta.division,
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

          // 2. Forward clear status to Savi
          if (isKesrox && session.sock) {
            try {
              const initialNotice =
`🚨 *NEW ${divMeta.label} LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Phone:* ⏳ *Awaiting Prospect's Mobile No. (Meta Ad LID)*
💬 *Inquiry:* "${rawText}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (${divMeta.emoji} ${divMeta.label})
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
⚡ *Status:* Logged in Allota CRM. Click below to chat directly with prospect on WhatsApp.
👉 *Kesrox WhatsApp:* Open WhatsApp on Kesrox Phone ➔ Chat "${senderName}"`;

              await sendAndCacheMessage(session.sock, saviJid, { text: initialNotice });
              console.log(`[Lead Forwarded] Sent initial awaiting-phone notice to Savi for Kesrox (${divMeta.label})`);
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
      const data: any = await res.json();
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

app.get("/api/:companyId/debug", (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);
  if (!session) {
    return res.json({ found: false });
  }

  const filesCount = fs.existsSync(session.authDir) ? fs.readdirSync(session.authDir).length : 0;
  const hasCreds = fs.existsSync(path.join(session.authDir, "creds.json"));

  res.json({
    found: true,
    companyId: cleanId,
    status: session.status,
    phone: session.phone,
    hasSock: Boolean(session.sock),
    hasCreds,
    authFilesCount: filesCount,
    lastDisconnectCode: session.lastDisconnectCode,
    lastError: session.lastError,
    lastConnectedAt: session.lastConnectedAt,
    activeLidLeadsCount: activeLidLeads.size,
    lidToPnMapCount: lidToPnMap.size,
  });
});

app.get("/api/:companyId/lead-cache", (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  res.json({
    activeLidLeads: Array.from(activeLidLeads.entries()),
    lidToPnMap: Array.from(lidToPnMap.entries()),
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
  res.json({ success: true, status: session.status, phone: session.phone });
});

// Force-restore session directly from PostgreSQL vault
app.post("/api/:companyId/restore", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = getOrCreateTenantSession(cleanId);

  try {
    const r = await fetch(ALLOTA_WEBHOOK_URL);
    if (r.ok) {
      const data: any = await r.json();
      const tenant = data?.tenants?.find((t: any) => t.companyId === cleanId);
      if (tenant?.whatsappCompanionCreds) {
        restoreSessionFilesFromMap(session.authDir, tenant.whatsappCompanionCreds);
        console.log(`[Manual Restore] Hydrated PostgreSQL keys for ${cleanId}`);
        const started = await startTenantSocket(cleanId);
        return res.json({ success: true, status: started.status, phone: started.phone });
      }
    }
    return res.status(404).json({ error: "No vaulted keys found in PostgreSQL" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
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

// Update a lead with their real phone number, update CRM, and dispatch directly to Savi
app.post("/api/:companyId/update-lead-phone", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);
  const { name, phone, inquiry, headline, division, isUpdate } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ error: "name and phone are required" });
  }

  const cleanDigits = String(phone).replace(/\D/g, "");
  const clean10 = cleanDigits.startsWith("91") && cleanDigits.length === 12 ? cleanDigits.slice(2) : cleanDigits.slice(-10);
  const formatted = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5)}`;
  const divLabel = division === "PCD_FRANCHISE" ? "PCD FRANCHISE" : "THIRD-PARTY MANUFACTURING";
  const divEmoji = division === "PCD_FRANCHISE" ? "🏢" : "🏭";

  // 1. Update Allota CRM
  try {
    await fetch(ALLOTA_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: cleanId,
        senderPhone: formatted,
        senderName: name,
        division: division || "THIRD_PARTY",
        messageText: inquiry || "Meta Ad Lead Updated with Phone Number",
        isFromMe: false,
        isGroup: false,
        hasAdReferral: true,
      }),
    });
  } catch (err: any) {
    console.warn("[CRM Update Error]", err?.message);
  }

  // 2. Dispatch to Savi on WhatsApp
  if (session?.sock) {
    try {
      const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
      const updateBadge = isUpdate ? " (REPEAT INQUIRY)" : "";
      const headlineLine = headline ? `📢 *Ad Headline:* ${headline}\n` : "";
      const text =
`🚨 *NEW ${divLabel} LEAD (KESROX)${updateBadge}*

👤 *Prospect Name:* ${name}
📞 *Real Phone:* ${formatted}
${headlineLine}💬 *Inquiry Details:* "${inquiry || "Hi Kesrox! Product: __ | Monthly qty: __ | Drug Licence/GST: Y/N"}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (${divEmoji} ${divLabel})
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${clean10}
👉 *Click to WhatsApp:* https://wa.me/91${clean10}`;

      await sendAndCacheMessage(session.sock, saviJid, { text });
      console.log(`[Dispatched to Savi] ${name} -> ${formatted}`);
    } catch (waErr: any) {
      console.warn("[Dispatch to Savi Error]", waErr?.message);
    }
  }

  res.json({ success: true, name, phone: formatted });
});

// Dedicated forward-lead endpoint for instant notification to Savi
app.post(["/api/:companyId/forward-lead", "/forward-lead"], async (req, res) => {
  const companyId = req.params?.companyId || req.body?.companyId || "cmubi8zf6000004l8y45hhuds";
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);
  const { name, phone, clean10: explicitClean10, inquiry, headline, division, isUpdate } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ error: "name and phone are required" });
  }

  const cleanDigits = String(phone).replace(/\D/g, "");
  const clean10 = explicitClean10 || (cleanDigits.startsWith("91") && cleanDigits.length === 12 ? cleanDigits.slice(2) : cleanDigits.slice(-10));
  const formatted = `+91 ${clean10.slice(0, 5)} ${clean10.slice(5)}`;
  const divLabel = division === "PCD_FRANCHISE" ? "PCD FRANCHISE" : "THIRD-PARTY MANUFACTURING";
  const divEmoji = division === "PCD_FRANCHISE" ? "🏢" : "🏭";

  if (session?.sock) {
    try {
      const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
      const updateBadge = isUpdate ? " (REPEAT INQUIRY)" : "";
      const headlineLine = headline ? `📢 *Ad Headline:* ${headline}\n` : "";
      const text =
`🚨 *NEW ${divLabel} LEAD (KESROX)${updateBadge}*

👤 *Prospect Name:* ${name}
📞 *Real Phone:* ${formatted}
${headlineLine}💬 *Inquiry Details:* "${inquiry || "Hi Kesrox! Product: __ | Monthly qty: __ | Drug Licence/GST: Y/N"}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (${divEmoji} ${divLabel})
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Click to Call:* tel:+91${clean10}
👉 *Click to WhatsApp:* https://wa.me/91${clean10}`;

      await sendAndCacheMessage(session.sock, saviJid, { text });
      console.log(`[Lead Forwarded to Savi] Dispatched ${name} (${formatted}) via forward-lead`);
      return res.json({ success: true, forwardedTo: saviJid, phone: formatted });
    } catch (waErr: any) {
      console.warn("[Dispatch to Savi Error]", waErr?.message);
      return res.status(500).json({ error: waErr?.message });
    }
  }

  return res.status(503).json({ error: "WhatsApp companion is not connected for this company" });
});

// Trigger a live test lead for verification
app.post("/api/:companyId/test-lead", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);

  if (!session || !session.sock || session.status !== "CONNECTED") {
    return res.status(400).json({ error: "WhatsApp is not connected for this company" });
  }

  const senderName = req.body?.name || "Dr. Rajesh Sharma (PCD Test Lead)";
  const senderPhone = req.body?.phone || "919876543210";
  const rawText = req.body?.inquiry || "Namaste, I saw your Meta Ad. Interested in Kesrox PCD Pharma franchise monopoly rights and product catalogue for Ambala district.";
  const source = req.body?.source || "Meta Click-to-WhatsApp Ad (Test Lead)";
  const displayPhone = req.body?.displayPhone || (senderPhone.startsWith("91") && senderPhone.length === 12 ? `+91 ${senderPhone.slice(2, 7)} ${senderPhone.slice(7)}` : `+${senderPhone}`);
  const directAction = req.body?.directAction || (senderPhone.startsWith("91") ? `https://wa.me/${senderPhone}` : `Open WhatsApp on Kesrox Phone ➔ Chat "${senderName}"`);

  // 1. Ingest into Allota CRM
  try {
    await fetch(ALLOTA_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: session.companyId,
        senderPhone: displayPhone,
        senderName,
        messageText: rawText,
        isFromMe: false,
        isGroup: false,
        hasAdReferral: true,
      }),
    });
    console.log(`[Lead Ingested] Saved to Allota CRM for ${session.companyId}`);
  } catch (e: any) {
    console.warn("CRM test error:", e?.message);
  }

  // 2. Forward to Savi on WhatsApp
  try {
    const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
    const forwardText =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Phone:* ${displayPhone}
💬 *Inquiry:* "${rawText}"
⚡ *Source:* ${source}
🕒 *Received:* ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
👉 *Direct Action:* ${directAction}`;

    await sendAndCacheMessage(session.sock, saviJid, { text: forwardText });
    console.log(`[Lead Forwarded] Successfully sent via WhatsApp to Savi (+${SAVI_PHONE})!`);

    return res.json({
      success: true,
      forwardedTo: `+${SAVI_PHONE}`,
      lead: { name: senderName, phone: displayPhone, inquiry: rawText },
    });
  } catch (err: any) {
    console.error("Failed to forward test message to Savi:", err);
    return res.status(500).json({ error: err?.message || "Failed to send WhatsApp message" });
  }
});

// Forward existing captured ad leads directly to Savi in clean standard format
app.post("/api/:companyId/forward-past-leads", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);

  if (!session || !session.sock || session.status !== "CONNECTED") {
    return res.status(400).json({ error: "WhatsApp is not connected for this company" });
  }

  const saviJid = `${SAVI_PHONE.replace(/\D/g, "")}@s.whatsapp.net`;
  const pastLeads = [
    {
      name: "A K DRUGS AGENCY",
      phone: "⏳ Awaiting Mobile Number (Bot Auto-Prompt Sent)",
      inquiry: "Hi Kesrox! Product: __ | Monthly qty: __ | Drug Licence/GST: Y/N",
      time: "07:19 PM",
      action: "Open WhatsApp on Kesrox Phone ➔ Chat 'A K DRUGS AGENCY'",
    },
    {
      name: "Renjith C",
      phone: "⏳ Awaiting Mobile Number (Bot Auto-Prompt Sent)",
      inquiry: "Hi Kesrox! Product: __ | Monthly qty: __ | Drug Licence/GST: Y/N - Please send the details",
      time: "07:26 PM",
      action: "Open WhatsApp on Kesrox Phone ➔ Chat 'Renjith C'",
    },
  ];

  for (const lead of pastLeads) {
    const text =
`🚨 *NEW THIRD-PARTY MANUFACTURING LEAD (KESROX)*

👤 *Prospect:* ${lead.name}
📞 *Phone:* ${lead.phone}
💬 *Inquiry:* "${lead.inquiry}"
⚡ *Source:* Meta Click-to-WhatsApp Ad (🏭 Third-Party Mfg)
🕒 *Received:* ${lead.time}
👉 *Direct Action:* ${lead.action}`;

    try {
      await sendAndCacheMessage(session.sock, saviJid, { text });
      console.log(`[Lead Forwarded to Savi] Dispatched ${lead.name} as Third-Party Manufacturing`);
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e: any) {
      console.warn("Error forwarding lead to Savi:", e?.message);
    }
  }

  return res.json({ success: true, forwardedCount: pastLeads.length });
});

// Prompt existing captured ad leads who only have an LID to provide their real callable phone number
app.post("/api/:companyId/prompt-pending-leads", async (req, res) => {
  const { companyId } = req.params;
  const cleanId = sanitizeCompanyId(companyId);
  const session = tenantSessions.get(cleanId);

  if (!session || !session.sock || session.status !== "CONNECTED") {
    return res.status(400).json({ error: "WhatsApp is not connected for this company" });
  }

  // Target the captured leads that landed via Meta Ad LIDs
  const targets = [
    { jid: "77588651323577@lid", name: "A K DRUGS AGENCY" },
    { jid: "136391149277265@lid", name: "Renjith C" },
  ];

  const results: any[] = [];
  for (const t of targets) {
    try {
      activeLidLeads.set(t.jid, {
        companyId: session.companyId,
        senderName: t.name,
        initialInquiry: "Ad Lead Awaiting Phone Number",
        firstSeenAt: new Date(),
        promptSent: true,
      });

      // 1. Send native 1-tap phone share button
      try {
        await sendAndCacheMessage(session.sock, t.jid, { requestPhoneNumber: true } as any);
      } catch {}

      // 2. Send polite prompt text for Third Party Manufacturing
      const prompt = `Namaste ${t.name}! 🙏\n\nThank you for reaching out to *Kesrox Healthcare* regarding *Third-Party Pharma Manufacturing*.\n\nTo share our complete *WHO-GMP Manufacturing Approvals, Product List, Batch Sizes & Commercial Quotations* with you, please tap the *"Share Phone Number"* button above or reply with your:\n1. 📱 *Calling / WhatsApp Mobile Number*\n2. 📍 *City & State*\n\nOur team will assist you right away!`;
      await sendAndCacheMessage(session.sock, t.jid, { text: prompt });
      results.push({ name: t.name, jid: t.jid, status: "PROMPTED_SUCCESS" });
    } catch (err: any) {
      results.push({ name: t.name, jid: t.jid, error: err?.message });
    }
  }

  return res.json({ success: true, results });
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
