import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";

const LOG_FILE = path.join(process.cwd(), "tmp", "live_messages.log");

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString("en-IN");
  const entry = `[${ts}] ${line}\n`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, entry);
}

async function startCompanionListener() {
  fs.writeFileSync(LOG_FILE, "=== ALLOTA COMPANION LISTENER STARTED ===\n");
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
      appendLog("🎉 WHATSAPP COMPANION IS OFFICIALLY CONNECTED & LIVE!");
      appendLog(`🎉 Linked Account: ${sock.user?.name || "Revix Solutions"} (${sock.user?.id})`);
      appendLog("👀 LISTENING: Send any message to this WhatsApp account right now!");
    } else if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      appendLog(`Connection closed with status: ${statusCode}. Reconnecting in 3s...`);
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startCompanionListener, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    appendLog(`⚡ Event: messages.upsert (batch count: ${messages.length}, type: ${type})`);
    for (const msg of messages) {
      const jid = msg.key.remoteJid || "unknown";
      const isFromMe = msg.key.fromMe;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        JSON.stringify(msg.message);

      const senderPhone = jid.replace(/@s\.whatsapp\.net/, "").replace(/@g\.us/, "");
      const senderName = msg.pushName || "Prospect Lead";

      appendLog(`\n======================================================`);
      appendLog(`📩 NEW MESSAGE RECEIVED:`);
      appendLog(`   From: ${senderName} (+${senderPhone})`);
      appendLog(`   Type: ${isFromMe ? "Outgoing (From You)" : "Incoming (From Prospect/Lead)"}`);
      appendLog(`   Text: "${text}"`);
      appendLog(`   Action: Pushing new Lead into Allota CRM database...`);
      appendLog(`======================================================\n`);
    }
  });
}

startCompanionListener().catch(console.error);
