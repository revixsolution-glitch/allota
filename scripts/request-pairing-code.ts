import makeWASocket, { useMultiFileAuthState, delay, DisconnectReason, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";

async function main() {
  const rawPhone = process.argv[2] || "9996589217";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const fullPhone = cleanPhone.startsWith("91") && cleanPhone.length === 12 ? cleanPhone : `91${cleanPhone}`;

  console.log(`\n========================================`);
  console.log(`Initiating Pairing for: +${fullPhone}`);
  console.log(`========================================\n`);

  const authDir = path.join(process.cwd(), "tmp", "whatsapp_auth_test");
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  fs.mkdirSync(authDir, { recursive: true });

  const { version } = await fetchLatestBaileysVersion();
  console.log(`Using WhatsApp Web Protocol Version: ${version.join(".")}`);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }) as any,
    browser: Browsers.macOS("Chrome"),
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPath = path.join(process.cwd(), "tmp", "whatsapp_qr.png");
      await QRCode.toFile(qrPath, qr, { width: 400 });
      console.log(`\n📷 QR Code saved to: ${qrPath}`);
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`);
      if (!shouldReconnect) {
        console.log("Logged out. Please re-pair.");
        process.exit(0);
      }
    } else if (connection === "open") {
      console.log("\n🎉 ========================================");
      console.log("🎉 SUCCESS: WHATSAPP CONNECTED & LINKED!");
      console.log("🎉 User phone is now actively linked to CRM.");
      console.log("========================================\n");
    }
  });

  // Wait 4 seconds for socket handshake before requesting pairing code
  await delay(4000);

  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(fullPhone);
      console.log(`\n----------------------------------------`);
      console.log(`YOUR OFFICIAL 8-CHARACTER PAIRING CODE:`);
      console.log(`\n       👉  ${code}  👈\n`);
      console.log(`----------------------------------------`);
      console.log(`Instructions for Phone:`);
      console.log(`1. Open WhatsApp on ${fullPhone}`);
      console.log(`2. Go to: Settings > Linked Devices > Link a Device`);
      console.log(`3. Tap "Link with phone number instead" at the bottom`);
      console.log(`4. Enter the code above: ${code}\n`);
    } catch (err: any) {
      console.error("Error requesting pairing code:", err?.message || err);
    }
  } else {
    console.log("Device is already registered & authenticated!");
  }
}

main().catch(console.error);
