"use client";

import { useState, useEffect } from "react";

function cleanDigits(val?: string | null): string {
  if (!val) return "";
  return val.replace(/\D/g, "");
}

function formatPhoneDisplay(raw?: string | null): string {
  const digits = cleanDigits(raw);
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return `+${digits}`;
}

export function WhatsAppCompanionSection({
  initialPhone,
  initialConnected = false,
  initialConnectedPhone,
}: {
  initialPhone?: string;
  initialConnected?: boolean;
  initialConnectedPhone?: string;
}) {
  const initialLocalPhone = cleanDigits(initialPhone || initialConnectedPhone).replace(/^91/, "");

  const [phone, setPhone] = useState(initialLocalPhone);
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(initialConnected ? "CONNECTED" : "NOT_CONNECTED");
  const [connectedPhone, setConnectedPhone] = useState<string | null>(
    initialConnected ? (initialConnectedPhone || null) : null
  );
  const [copied, setCopied] = useState(false);

  // Live Official Chrome QR Code Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  // Check initial status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/whatsapp-companion/chrome-qr");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.status === "CONNECTED") {
          setStatus("CONNECTED");
          if (data.phone) setConnectedPhone(data.phone);
        }
      } catch {
        // Keep initial connected state intact if network blip
      }
    }
    checkStatus();
  }, [initialConnected]);

  // Polling for connection when QR Modal is open
  useEffect(() => {
    let interval: any;
    if (qrModalOpen) {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/whatsapp-companion/chrome-qr");
          const data = await res.json();
          if (data?.status === "CONNECTED") {
            setJustConnected(true);
            setStatus("CONNECTED");
            if (data.phone) setConnectedPhone(data.phone);

            // Pop-up ALWAYS ends automatically when connected!
            setTimeout(() => {
              setQrModalOpen(false);
              setJustConnected(false);
            }, 1800);
          } else if (data?.qrCode && data.qrCode !== qrDataUrl) {
            setQrDataUrl(data.qrCode);
            setQrLoading(false);
          }
        } catch {
          // ignore
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [qrModalOpen, qrDataUrl]);

  // Trigger Official Google Chrome QR Code Generation
  async function handleOpenQrModal() {
    setQrModalOpen(true);
    setQrLoading(true);
    setQrError(null);
    setQrDataUrl(null);
    setJustConnected(false);

    try {
      const res = await fetch("/api/whatsapp-companion/chrome-qr", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start official Chrome WhatsApp Web.");
      }

      if (data.status === "CONNECTED") {
        setStatus("CONNECTED");
        if (data.phone) setConnectedPhone(data.phone);
        setQrModalOpen(false);
      } else if (data.qrCode) {
        setQrDataUrl(data.qrCode);
      }
    } catch (err: any) {
      setQrError(err?.message || "Failed to load live QR code. Please try again.");
    } finally {
      setQrLoading(false);
    }
  }

  // Trigger 8-Digit Pairing Code Generation
  async function handleRequestCode(e?: React.FormEvent | React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setError(null);
    setPairingCode(null);
    setLoading(true);

    try {
      const res = await fetch("/api/whatsapp-companion/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "code", phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate pairing code.");
      }

      if (data.alreadyRegistered || data.status === "CONNECTED") {
        setStatus("CONNECTED");
        if (data.phone) setConnectedPhone(data.phone);
        setPairingCode(null);
      } else if (data.pairingCode) {
        setPairingCode(data.pairingCode);
        setStatus("PAIRING_REQUESTED");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect this WhatsApp session?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp-companion/chrome-qr", { method: "DELETE" });
      await fetch("/api/whatsapp-companion/pair", { method: "DELETE" });
      setStatus("NOT_CONNECTED");
      setConnectedPhone(null);
      setPairingCode(null);
      setQrDataUrl(null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // 1. SLEEK CONNECTED STATE IN ALLOTA
  if (status === "CONNECTED") {
    const displayPhone = formatPhoneDisplay(connectedPhone || phone);

    return (
      <section className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/10 p-5 sm:p-6 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20 backdrop-blur-md transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl shadow-md shadow-emerald-500/25 shrink-0 text-white">
              💬
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  Official Chrome WhatsApp Active
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-white/70 px-2 py-0.5 rounded-md border border-emerald-200">
                  Connected
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                WhatsApp Linked: <span className="font-mono text-emerald-800">{displayPhone || "Official Session Active"}</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Monitoring incoming Meta ad leads &amp; auto-forwarding to Savi in real time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenQrModal}
              className="rounded-2xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition shadow-xs cursor-pointer"
            >
              🔄 Re-scan QR
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 2. DISCONNECTED / SETUP STATE
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-white via-emerald-50/25 to-teal-50/40 p-5 sm:p-6 neo-panel space-y-6 shadow-sm">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl shadow-md shadow-emerald-500/25 shrink-0 text-white">
            💬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                Official Chrome WhatsApp Companion
              </span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-200">
                100% Official Web Link
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
              Connect WhatsApp to Capture Meta Ads Leads
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
              Your mobile WhatsApp app stays 100% active. Allota links via official Google Chrome WhatsApp Web to capture incoming leads and route them directly to Savi.
            </p>
          </div>
        </div>

        {/* PRIMARY ACTION: POP-UP LIVE OFFICIAL QR CODE */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleOpenQrModal}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-xs font-black text-white shadow-xl shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer active:scale-95"
          >
            <span className="text-base">📷</span>
            <span>Connect WhatsApp (Open Official QR Pop-up)</span>
          </button>
        </div>
      </div>

      {/* Secondary Alternative: Code Pairing Input */}
      <div className="bg-white/80 rounded-2xl p-4 border border-line space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Alternative: Connect via 8-Digit Pairing Code
          </span>
          <span className="text-[10px] text-slate-400">If camera scanner unavailable</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none select-none">
              🇮🇳 +91
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(cleanDigits(e.target.value).slice(0, 10))}
              placeholder="74948 09665"
              className="w-full rounded-2xl border border-slate-200 bg-white pl-16 pr-4 py-2.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
            />
          </div>

          <button
            type="button"
            onClick={handleRequestCode}
            disabled={loading || phone.length < 10}
            className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            {loading ? "Generating..." : "Get Code"}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800 shadow-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Pairing Code Display Box */}
      {pairingCode && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-6 space-y-4 shadow-lg shadow-emerald-500/10 animate-in fade-in duration-200">
          <div className="text-center space-y-1.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
              Your 8-Character Pairing Code
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-700 bg-emerald-50 px-6 py-2.5 rounded-2xl border border-emerald-300 select-all shadow-inner">
                {pairingCode}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shadow-xs active:scale-95"
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <p className="text-[11px] font-medium text-slate-500 pt-1">
              Enter this code in WhatsApp on your phone: Settings ➔ Linked Devices ➔ Link with phone number
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIVE POP-UP OFFICIAL CHROME QR CODE MODAL                                 */}
      {/* ========================================================================= */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-line space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xl font-black">
                  📷
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Official WhatsApp Web QR Code
                  </h3>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    ● Real Google Chrome Session (100% Official)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            {justConnected ? (
              <div className="py-10 text-center space-y-3 animate-in zoom-in-95">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl font-black">
                  ✓
                </div>
                <h4 className="text-lg font-black text-slate-900">
                  🎉 WhatsApp Connected Successfully!
                </h4>
                <p className="text-xs text-emerald-700 font-bold">
                  Closing pop-up and activating Allota CRM link...
                </p>
              </div>
            ) : qrLoading ? (
              <div className="py-12 text-center space-y-4">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-xs font-bold text-slate-700">
                  Launching official Google Chrome &amp; rendering WhatsApp Web QR...
                </p>
                <p className="text-[10px] text-slate-400">Takes about 3 to 4 seconds</p>
              </div>
            ) : qrError ? (
              <div className="py-6 text-center space-y-4">
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-bold text-rose-800">
                  {qrError}
                </div>
                <button
                  type="button"
                  onClick={handleOpenQrModal}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Retry Official QR
                </button>
              </div>
            ) : qrDataUrl ? (
              <div className="space-y-4 text-center">
                {/* QR Code Container */}
                <div className="relative mx-auto inline-block rounded-3xl p-4 bg-white border-2 border-emerald-500 shadow-xl shadow-emerald-500/10">
                  <img
                    src={qrDataUrl}
                    alt="Official WhatsApp Web QR Code"
                    className="h-64 w-64 object-contain rounded-xl select-none"
                  />
                  <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Official Live QR • Waiting for phone camera scan</span>
                  </div>
                </div>

                {/* 3 Steps */}
                <div className="rounded-2xl bg-slate-50 border border-line p-4 text-left text-xs space-y-2">
                  <p className="font-extrabold text-slate-900 text-[11px] uppercase tracking-wider">
                    Instructions for Phone:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 font-medium">
                    <li>Open <strong>WhatsApp</strong> on your phone.</li>
                    <li>Tap <strong>Settings</strong> (iPhone) or <strong>3 dots</strong> (Android) ➔ <strong>Linked Devices</strong>.</li>
                    <li>Tap <strong>Link a Device</strong> and point your camera at this QR code.</li>
                  </ol>
                </div>
              </div>
            ) : null}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
              <span className="text-[11px] text-slate-400">
                🔒 Pop-up automatically closes when connected
              </span>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="rounded-xl border border-line px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
