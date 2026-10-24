import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";

export const dynamic = "force-dynamic";

interface ChromeSessionRecord {
  browser: any;
  page: any;
  qrDataUrl?: string;
  status: "STARTING" | "AWAITING_SCAN" | "CONNECTED" | "ERROR";
  phone?: string;
  lastPing: number;
}

// Global singleton map of Chrome sessions per company
declare global {
  var _chromeSessions: Map<string, ChromeSessionRecord> | undefined;
}

if (!globalThis._chromeSessions) {
  globalThis._chromeSessions = new Map();
}

const chromeSessions = globalThis._chromeSessions;

async function startChromeSession(companyId: string): Promise<ChromeSessionRecord> {
  const existing = chromeSessions.get(companyId);
  if (existing?.browser) {
    try {
      await existing.browser.close();
    } catch {}
  }

  const userDataDir = path.join(process.cwd(), "tmp", "chrome_sessions", `comp_${companyId}`);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  console.log(`[Chrome WA] Starting real Google Chrome for company: ${companyId}`);

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

  const sessionObj: ChromeSessionRecord = {
    browser,
    page,
    status: "STARTING",
    lastPing: Date.now(),
  };

  chromeSessions.set(companyId, sessionObj);

  // Navigate to WhatsApp Web
  console.log(`[Chrome WA] Navigating to https://web.whatsapp.com...`);
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2", timeout: 60000 });

  // Start background watcher loop for QR and Login
  (async () => {
    try {
      const qrSelector = 'canvas[aria-label="Scan this QR code to link a device"], div[data-ref] canvas, canvas';

      while (chromeSessions.get(companyId)?.browser === browser) {
        // Check if already logged in
        const isLogged = await page.evaluate(() => {
          return Boolean(document.querySelector("#pane-side") || document.querySelector('[data-icon="chat"]') || document.querySelector("header"));
        });

        if (isLogged) {
          console.log(`[Chrome WA] 🎉 SUCCESS: Company ${companyId} logged in via QR scan!`);
          sessionObj.status = "CONNECTED";

          // Update database
          await prisma.companySettings.updateMany({
            where: { companyId },
            data: {
              whatsappConnected: true,
              whatsappCompanionPhone: "Connected via Official Chrome",
            },
          });

          break;
        }

        // Check if QR code is visible
        const qrEl = await page.$(qrSelector);
        if (qrEl) {
          const buffer = await qrEl.screenshot();
          sessionObj.qrDataUrl = `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
          sessionObj.status = "AWAITING_SCAN";
        }

        await new Promise((r) => setTimeout(r, 1500));

        // Auto close browser if no ping from client for 3 minutes
        if (Date.now() - sessionObj.lastPing > 180000) {
          console.log(`[Chrome WA] Session timed out for company ${companyId}`);
          break;
        }
      }
    } catch (err) {
      console.error(`[Chrome WA] Watcher error:`, err);
      sessionObj.status = "ERROR";
    }
  })();

  return sessionObj;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = getActiveCompanyId(session);
    if (!companyId || companyId === "default") {
      return NextResponse.json({ error: "No organization workspace selected." }, { status: 400 });
    }

    let current = chromeSessions.get(companyId);

    if (!current || !current.browser || current.status === "ERROR" || current.status === "CONNECTED") {
      current = await startChromeSession(companyId);
    }

    current.lastPing = Date.now();

    // Wait up to 6 seconds for QR code to be rendered
    const start = Date.now();
    while (!current.qrDataUrl && current.status !== "CONNECTED" && Date.now() - start < 6000) {
      await new Promise((r) => setTimeout(r, 400));
    }

    return NextResponse.json({
      success: true,
      status: current.status,
      qrCode: current.qrDataUrl || null,
    });
  } catch (err: any) {
    console.error("[Chrome WA] POST error:", err);
    return NextResponse.json({ error: err?.message || "Failed to start Chrome QR session" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = getActiveCompanyId(session);
    if (!companyId || companyId === "default") {
      return NextResponse.json({ status: "NOT_CONNECTED" });
    }

    const current = chromeSessions.get(companyId);
    if (current) {
      current.lastPing = Date.now();
      return NextResponse.json({
        status: current.status,
        qrCode: current.qrDataUrl || null,
        phone: current.phone || null,
      });
    }

    // Check DB
    const settings = await prisma.companySettings.findFirst({
      where: { companyId },
      select: { whatsappConnected: true, whatsappCompanionPhone: true },
    });

    if (settings?.whatsappConnected) {
      return NextResponse.json({
        status: "CONNECTED",
        phone: settings.whatsappCompanionPhone || "Active",
      });
    }

    return NextResponse.json({ status: "NOT_CONNECTED" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = getActiveCompanyId(session);
  if (!companyId || companyId === "default") {
    return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
  }

  const current = chromeSessions.get(companyId);
  if (current?.browser) {
    try { await current.browser.close(); } catch {}
  }
  chromeSessions.delete(companyId);

  await prisma.companySettings.updateMany({
    where: { companyId },
    data: { whatsappConnected: false, whatsappCompanionPhone: null },
  });

  return NextResponse.json({ success: true, status: "NOT_CONNECTED" });
}
