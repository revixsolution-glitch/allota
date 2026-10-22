import makeWASocket, { useMultiFileAuthState, delay, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";

async function main() {
  const rawPhone = process.argv[2] || "9996589217";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const fullPhone = cleanPhone.startsWith("91") && cleanPhone.length === 12 ? cleanPhone : `91${cleanPhone}`;

  console.log(`\n========================================`);
  console.log(`Initiating Pairing for: +${fullPhone}`);
  console.log(`========================================\n`);

  const authDir = path.join(process.cwd(), "tmp", "whatsapp_auth_test");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as any,
    browser: ["Allota CRM", "Chrome", "120.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        console.log("Reconnecting...");
      } else {
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

  // Wait 3 seconds for socket handshake before requesting pairing code
  await delay(3000);

  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(fullPhone);
      console.log(`\n----------------------------------------`);
      console.log(`YOUR 8-CHARACTER PAIRING CODE:`);
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
