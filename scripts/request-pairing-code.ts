import makeWASocket, { 
  useMultiFileAuthState, 
  delay, 
  DisconnectReason, 
  Browsers, 
  fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";

async function runPairing() {
  const rawPhone = process.argv[2] || "9996589217";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const fullPhone = cleanPhone.startsWith("91") && cleanPhone.length === 12 
    ? cleanPhone 
    : `91${cleanPhone.slice(-10)}`;

  console.log(`\n========================================`);
  console.log(`🚀 Starting Stable Pairing for: +${fullPhone}`);
  console.log(`========================================\n`);

  const authDir = path.join(process.cwd(), "tmp", `whatsapp_auth_${fullPhone}`);
  // Only start fresh if this is an explicit new attempt
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { version } = await fetchLatestBaileysVersion();
  console.log(`📡 WA Web Protocol Version: ${version.join(".")}`);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  let pairingCodeRequested = false;
  let isConnected = false;

  function connect() {
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
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        isConnected = true;
        console.log("\n🎉 ========================================");
        console.log("🎉 SUCCESS: WHATSAPP CONNECTED & LINKED!");
        console.log(`🎉 Account Linked: ${sock.user?.name || "WhatsApp User"} (${sock.user?.id})`);
        console.log("🎉 Session saved permanently. Ready for CRM auto-forwarding.");
        console.log("========================================\n");
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const reason = (lastDisconnect?.error as any)?.message || "Socket Closed";
        
        console.log(`⚠️ Socket disconnected (code: ${statusCode}, reason: ${reason})`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("❌ Logged out by device. Clean up auth directory.");
          fs.rmSync(authDir, { recursive: true, force: true });
          process.exit(1);
        }

        if (!isConnected) {
          console.log("🔄 Re-establishing persistent socket with SAME session credentials in 2s...");
          setTimeout(connect, 2000);
        }
      }
    });

    // Request pairing code after initial handshake
    setTimeout(async () => {
      if (!pairingCodeRequested && !sock.authState.creds.registered && !isConnected) {
        try {
          pairingCodeRequested = true;
          const code = await sock.requestPairingCode(fullPhone);
          console.log(`\n----------------------------------------`);
          console.log(`YOUR OFFICIAL 8-CHARACTER PAIRING CODE:`);
          console.log(`\n       👉  ${code}  👈\n`);
          console.log(`----------------------------------------`);
          console.log(`Phone Instructions:`);
          console.log(`1. Open WhatsApp on +${fullPhone}`);
          console.log(`2. Go to: Settings > Linked Devices > Link a Device`);
          console.log(`3. Tap "Link with phone number instead" at the bottom`);
          console.log(`4. Enter the code: ${code}`);
          console.log(`\n⏳ Socket is staying alive and waiting for your entry...\n`);
        } catch (err: any) {
          console.error("❌ Pairing code error:", err?.message || err);
          pairingCodeRequested = false;
        }
      }
    }, 4000);
  }

  connect();
}

runPairing().catch(console.error);
