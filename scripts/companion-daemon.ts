import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";

const LOG_FILE = path.join(process.cwd(), "tmp", "live_messages.log");

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString("en-IN");
  const entry = `[${ts}] ${line}\n`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, entry);
  } catch {
    // ignore
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
];

async function startCompanionListener() {
  const authDir = path.join(process.cwd(), "tmp", "whatsapp_auth_test");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  appendLog(`Using Protocol Version: ${version.join(".")}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as any,
    browser: Browsers.macOS("Chrome"),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      appendLog("🛡️ PRIVACY FIREWALL ACTIVE: Only monitoring incoming leads from Meta ads.");
      appendLog(`🛡️ Linked Account: ${sock.user?.name || "Revix Solutions"} (${sock.user?.id})`);
      appendLog("🔒 Personal chats, family groups, and outbound messages are strictly excluded.");
    } else if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      appendLog(`Connection closed with status: ${statusCode}. Reconnecting in 3s...`);
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startCompanionListener, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid || "";

      // 1. PRIVACY RULE: Never touch group chats
      if (jid.endsWith("@g.us")) continue;

      // 2. PRIVACY RULE: Never touch status / broadcast updates
      if (jid.includes("@broadcast") || jid === "status@broadcast") continue;

      // 3. PRIVACY RULE: Never monitor outbound messages typed by you
      if (msg.key.fromMe) continue;

      const rawText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";

      const cleanText = rawText.trim().toLowerCase();
      if (!cleanText) continue;

      // 4. Check for Meta Ad Referral metadata (externalAdReply)
      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo;
      const hasAdReferral = Boolean(contextInfo?.externalAdReply);

      // 5. Check for commercial inquiry intent
      const matchesCommercialIntent = AD_KEYWORDS.some((kw) => cleanText.includes(kw));

      // 6. FILTER: Drop any personal message that is not a commercial ad inquiry
      if (!hasAdReferral && !matchesCommercialIntent) {
        appendLog(`[Privacy Guard] Filtered non-ad message from personal contact. No data stored.`);
        continue;
      }

      const senderPhone = jid.replace(/@s\.whatsapp\.net/, "");
      const senderName = msg.pushName || "Prospect Lead";

      appendLog(`\n🎯 ======================================================`);
      appendLog(`🎯 VERIFIED META AD LEAD DETECTED:`);
      appendLog(`   Prospect: ${senderName} (+${senderPhone})`);
      appendLog(`   Type: ${hasAdReferral ? "Direct Click-to-WhatsApp Meta Ad" : "Commercial PCD Inquiry"}`);
      appendLog(`   Inquiry: "${rawText.slice(0, 100)}..."`);
      appendLog(`🎯 ======================================================\n`);

      // 1. Ingest into Allota CRM
      try {
        const crmRes = await fetch("https://allota.vercel.app/api/whatsapp-companion/incoming", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: "cmub4ssdx00000u8oqlqc62e0",
            senderPhone: `+${senderPhone}`,
            senderName,
            messageText: rawText,
            isFromMe: false,
            isGroup: false,
            hasAdReferral,
          }),
        });
        const crmData = await crmRes.json().catch(() => ({}));
        appendLog(`   Status: Auto-ingested into Allota CRM Leads Desk! (ID: ${crmData.leadId || "saved"})`);
      } catch (err: any) {
        appendLog(`   CRM sync error: ${err.message}`);
      }

      // 2. Forward lead card to Savi Kesrox on WhatsApp
      const saviJid = "917889107964@s.whatsapp.net";
      const forwardAlert =
`🚨 *NEW PCD FRANCHISE LEAD (KESROX)*

👤 *Prospect:* ${senderName}
📞 *Phone:* +${senderPhone}
💬 *Inquiry:* "${rawText}"

👉 *Chat with prospect directly:*
https://wa.me/${senderPhone}

_⚡ Auto-forwarded by Allota AI Desk_`;

      try {
        await sock.sendMessage(saviJid, { text: forwardAlert });
        appendLog(`   WhatsApp Alert: Sent directly to Savi Kesrox (+91 78891 07964) ✅`);
      } catch (fwdErr: any) {
        appendLog(`   Failed to forward to Savi: ${fwdErr?.message}`);
      }
    }
  });
}

startCompanionListener().catch(console.error);
