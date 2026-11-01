"use client";

import { useEffect, useState } from "react";

export function AntiScrapeShield() {
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    // 1. Detect Automated Browser / Scraping Agents (Puppeteer, Selenium, Playwright, AI Headless)
    function checkAutomation() {
      const isWebdriver = Boolean(navigator.webdriver);
      const isHeadless =
        /HeadlessChrome/.test(navigator.userAgent) ||
        (window as any).__puppeteer_eval ||
        (window as any)._phantom ||
        (window as any).callPhantom ||
        (window as any).__selenium_unwrapped ||
        (document as any).$cdc_asdjflasutopfhvcZLmcfl_;

      if (isWebdriver || isHeadless) {
        setBlockedReason(
          "Automated browser or AI scraping agent detected. To protect customer and commercial data, automated access is strictly blocked."
        );
      }
    }

    // 2. Detect Developer Tools Open (Console overrides, Network payload sniffers)
    function checkDevTools() {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;

      if (widthDiff || heightDiff) {
        setBlockedReason(
          "Developer Tools / Console inspection detected. DevTools access is restricted on this workspace to prevent data exfiltration."
        );
      }
    }

    // 3. Block Context Menu (Right Click -> Inspect)
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      return false;
    }

    // 4. Block DevTools and Source-Viewing Keyboard Shortcuts
    function handleKeyDown(e: KeyboardEvent) {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+Shift+I / Cmd+Option+I (DevTools Inspect)
      // Ctrl+Shift+J / Cmd+Option+J (Console)
      // Ctrl+Shift+C / Cmd+Option+C (Element picker)
      // Ctrl+U / Cmd+Option+U (View Source)
      // Ctrl+S / Cmd+S (Save HTML page)
      if (
        (cmdOrCtrl && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) ||
        (cmdOrCtrl && (e.key === "U" || e.key === "u" || e.key === "S" || e.key === "s"))
      ) {
        e.preventDefault();
        return false;
      }
    }

    // Initial check
    checkAutomation();
    checkDevTools();

    // Listeners
    window.addEventListener("resize", checkDevTools);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    // Periodic watchdog check (every 2.5s)
    const interval = setInterval(() => {
      checkAutomation();
      checkDevTools();
    }, 2500);

    return () => {
      window.removeEventListener("resize", checkDevTools);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      clearInterval(interval);
    };
  }, []);

  if (!blockedReason) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 text-white text-center select-none">
      <div className="max-w-lg bg-slate-900 border border-red-500/30 rounded-3xl p-8 shadow-2xl shadow-red-500/10">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto mb-5 text-2xl font-bold">
          🛡️
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Security Restriction Enforced</h2>
        <p className="text-sm text-slate-300 leading-relaxed mb-6">{blockedReason}</p>
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-left space-y-1.5 mb-6">
          <p className="font-semibold text-slate-300">How to proceed:</p>
          <p>• Close browser Developer Tools or the side inspection panel.</p>
          <p>• Disable third-party scraping extensions or AI browser controllers.</p>
          <p>• Refresh this page in standard Chrome, Edge, or Safari.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-semibold tracking-wide shadow-lg shadow-red-600/20 transition-all cursor-pointer"
        >
          Re-Check & Refresh Workspace
        </button>
      </div>
    </div>
  );
}
