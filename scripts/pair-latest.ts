import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestWaWebVersion, delay } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";

async function main() {
  const targetPhone = "917494809665";
  const authDir = path.join(process.cwd(), "tmp", "whatsapp_auth_latest");
  
  // Wipe session cleanly
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  fs.mkdirSync(authDir, { recursive: true });

  const { version, isLatest } = await fetchLatestWaWebVersion({});
  console.log(`Using Live WA Web Version: ${version.join(".")}, isLatest: ${isLatest}`);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }) as any,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPath = path.join(process.cwd(), "tmp", "whatsapp_qr.png");
      await QRCode.toFile(qrPath, qr, { width: 450 });
      fs.copyFileSync(qrPath, "/Users/kartikchaudhary/.gemini/antigravity/brain/64c32e3c-f2a6-4c0e-89ef-17400ec8bbb4/whatsapp_qr.png");
      console.log("📷 QR Code updated");
    }

    if (connection === "open") {
      console.log("\n🎉 ========================================");
      console.log("🎉 SUCCESS: WHATSAPP LINKED & CONNECTED!");
      console.log(`🎉 Account: ${sock.user?.name} (${sock.user?.id})`);
      console.log("========================================\n");
    } else if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      console.log(`Connection closed (status: ${statusCode})`);
    }
  });

  // Delay before requesting code to ensure socket readiness
  await delay(4000);

  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(targetPhone);
      console.log("\n========================================");
      console.log(`👉 FRESH CODE: ${code}`);
      console.log("========================================\n");
    } catch (e: any) {
      console.error("Pairing code error:", e?.message || e);
    }
  }
}

main().catch(console.error);
