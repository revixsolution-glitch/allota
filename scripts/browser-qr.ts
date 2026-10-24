import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";

async function main() {
  const userDataDir = path.join(process.cwd(), "tmp", "chrome_wa_browser_session");
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  console.log("🚀 Launching Chrome for Live Official WhatsApp Web QR Code...");
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--window-size=1280,800"
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
  
  console.log("🌐 Loading https://web.whatsapp.com...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2", timeout: 60000 });

  const qrCanvasSelector = 'canvas[aria-label="Scan this QR code to link a device"], div[data-ref] canvas, canvas';
  await page.waitForSelector(qrCanvasSelector, { timeout: 30000 });

  console.log("✅ Official WhatsApp Web QR Code detected!");
  await new Promise(r => setTimeout(r, 2000));

  const qrElement = await page.$(qrCanvasSelector);
  const artifactPath = "/Users/kartikchaudhary/.gemini/antigravity/brain/64c32e3c-f2a6-4c0e-89ef-17400ec8bbb4/whatsapp_qr.png";
  const tmpQrPath = path.join(process.cwd(), "tmp", "whatsapp_qr.png");

  if (qrElement) {
    await qrElement.screenshot({ path: tmpQrPath });
    fs.copyFileSync(tmpQrPath, artifactPath);
    console.log(`\n📷 FRESH OFFICIAL QR CODE SAVED TO ARTIFACT: ${artifactPath}\n`);
  }

  console.log("⏳ Chrome is waiting live for you to scan with your phone camera...");

  const startTime = Date.now();
  let loggedIn = false;

  while (Date.now() - startTime < 180000) { // 3 minutes
    const isLogged = await page.evaluate(() => {
      return Boolean(document.querySelector('#pane-side') || document.querySelector('[data-icon="chat"]') || document.querySelector('header'));
    });
    if (isLogged) {
      loggedIn = true;
      console.log("\n🎉🎉🎉 SUCCESS: WHATSAPP WEB LOGGED IN SUCCESSFULLY VIA QR SCAN! 🎉🎉🎉\n");
      const loggedInShot = path.join(process.cwd(), "tmp", "wa_logged_in.png");
      await page.screenshot({ path: loggedInShot });
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!loggedIn) {
    console.log("Timed out waiting for QR scan.");
    await browser.close();
  } else {
    console.log("Session active and persisted.");
  }
}

main().catch(console.error);
