import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";

async function main() {
  const rawPhone = process.argv[2] || "9996589217";
  const targetPhone = rawPhone.replace(/\D/g, "").slice(-10);

  const userDataDir = path.join(process.cwd(), "tmp", `chrome_wa_${targetPhone}`);
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  console.log(`\n========================================`);
  console.log(`🚀 Starting Browser Pairing for: +91 ${targetPhone}`);
  console.log(`========================================\n`);

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
  
  console.log("🌐 Navigating to https://web.whatsapp.com...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2", timeout: 60000 });

  await page.waitForSelector('canvas, div[data-ref]', { timeout: 30000 });
  console.log("✅ Landing page rendered.");

  // Click "Link with phone number"
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    for (const el of elements) {
      if (el.textContent && el.textContent.includes('Link with phone number') && el.children.length === 0) {
        (el as HTMLElement).click();
        return;
      }
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // Find phone input
  const inputSelector = 'input[type="text"], input[inputmode="numeric"], input';
  await page.waitForSelector(inputSelector, { timeout: 10000 });

  console.log(`📱 Entering phone number: ${targetPhone}...`);
  const inputs = await page.$$(inputSelector);
  for (const input of inputs) {
    await input.click();
    await input.type(targetPhone);
    break;
  }

  await new Promise(r => setTimeout(r, 1000));

  // Click "Next"
  const clickedNext = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (const b of buttons) {
      if (b.textContent && b.textContent.trim().toLowerCase() === 'next') {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  console.log("Clicked Next button:", clickedNext);

  console.log("⏳ Waiting for official pairing code from WhatsApp Web...");
  await new Promise(r => setTimeout(r, 5000));

  // Extract code from DOM
  const codeRaw = await page.evaluate(() => {
    const codeEl = document.querySelector('[data-link-code]');
    if (codeEl) {
      return codeEl.getAttribute('data-link-code');
    }
    // Alternatively look for individual char spans
    const spans = Array.from(document.querySelectorAll('span'));
    const codeCandidates = spans.filter(s => s.getAttribute('aria-details') || (s.className && s.className.includes('code')));
    if (codeCandidates.length >= 8) {
      return codeCandidates.slice(0, 8).map(s => s.textContent).join('');
    }
    const text = document.body.innerText;
    const match = text.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/) || text.match(/[A-Z0-9]{8}/);
    return match ? match[0] : null;
  });

  const cleanCode = (codeRaw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const formattedCode = cleanCode.length === 8 ? `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}` : cleanCode;

  console.log("\n========================================");
  console.log(`YOUR OFFICIAL BROWSER PAIRING CODE:`);
  console.log(`\n       👉  ${formattedCode}  👈\n`);
  console.log(`(Without hyphen: ${cleanCode})`);
  console.log(`========================================\n`);

  console.log("⏳ Browser is staying open in background waiting for you to enter code...");
  const startTime = Date.now();
  let connected = false;

  while (Date.now() - startTime < 300000) { // 5 minutes
    const isLoggedIn = await page.evaluate(() => {
      return Boolean(document.querySelector('#pane-side') || document.querySelector('[data-icon="chat"]') || document.querySelector('header'));
    });
    if (isLoggedIn) {
      connected = true;
      console.log("\n🎉🎉🎉 SUCCESS: YOUR PHONE IS OFFICIALLY CONNECTED & LINKED TO BROWSER SESSION! 🎉🎉🎉\n");
      const loggedInShot = path.join(process.cwd(), "tmp", `wa_web_logged_in_${targetPhone}.png`);
      await page.screenshot({ path: loggedInShot });
      console.log("📸 Logged-in screenshot saved to:", loggedInShot);
      break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!connected) {
    console.log("Timed out waiting for code entry.");
    await browser.close();
  } else {
    console.log("Session is persistent and alive in background.");
  }
}

main().catch(console.error);
