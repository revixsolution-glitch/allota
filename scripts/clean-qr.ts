import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";

async function main() {
  const authDir = path.join(process.cwd(), "tmp", "whatsapp_auth_clean");
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  fs.mkdirSync(authDir, { recursive: true });

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }) as any,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPath = path.join(process.cwd(), "tmp", "clean_qr.png");
      await QRCode.toFile(qrPath, qr, { width: 450 });
      // Copy to artifact dir
      const artifactPath = "/Users/kartikchaudhary/.gemini/antigravity/brain/64c32e3c-f2a6-4c0e-89ef-17400ec8bbb4/whatsapp_qr.png";
      fs.copyFileSync(qrPath, artifactPath);
      console.log("FRESH_QR_GENERATED");
    }

    if (connection === "open") {
      console.log("\n🎉 ========================================");
      console.log("🎉 SUCCESS: WHATSAPP LINKED SUCCESSFULLY!");
      console.log(`🎉 Linked Account: ${sock.user?.name} (${sock.user?.id})`);
      console.log("========================================\n");
    } else if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      console.log(`Connection closed (status ${statusCode})`);
    }
  });
}

main().catch(console.error);
