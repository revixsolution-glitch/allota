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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(initialConnected ? "CONNECTED" : "NOT_CONNECTED");
  const [connectedPhone, setConnectedPhone] = useState<string | null>(
    initialConnected ? (initialConnectedPhone || null) : null
  );

  // Live Pop-up Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  // Check initial connection status
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/whatsapp-companion/pair");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.status === "CONNECTED") {
          setStatus("CONNECTED");
          if (data.phone) setConnectedPhone(data.phone);
        } else if (data?.status === "NOT_CONNECTED") {
          setStatus("NOT_CONNECTED");
          setConnectedPhone(null);
        }
      } catch {
        // keep intact on network blip
      }
    }
    checkStatus();
  }, [initialConnected]);

  // Real-time polling when pop-up is open: always closes automatically when connected
  useEffect(() => {
    let interval: any;
    if (qrModalOpen) {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/whatsapp-companion/pair");
          const data = await res.json();
          if (data?.status === "CONNECTED") {
            setJustConnected(true);
            setStatus("CONNECTED");
            if (data.phone) setConnectedPhone(data.phone);

            // Pop-up ALWAYS ends automatically when connected
            setTimeout(() => {
              setQrModalOpen(false);
              setJustConnected(false);
            }, 1500);
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

  // Single Click Action: Connect WhatsApp (Opens official QR pop-up)
  async function handleConnectWhatsApp() {
    setError(null);
    setQrModalOpen(true);
    setQrLoading(true);
    setQrError(null);
    setQrDataUrl(null);
    setJustConnected(false);

    try {
      const res = await fetch("/api/whatsapp-companion/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "qr" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate WhatsApp connection.");
      }

      if (data.status === "CONNECTED" || data.alreadyRegistered) {
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

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect this WhatsApp number?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp-companion/pair", { method: "DELETE" });
      setStatus("NOT_CONNECTED");
      setConnectedPhone(null);
      setQrDataUrl(null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // 1. CONNECTED STATE IN ALLOTA
  if (status === "CONNECTED") {
    const displayPhone = formatPhoneDisplay(connectedPhone || phone);

    return (
      <section className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/10 p-5 sm:p-6 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20 backdrop-blur-md transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Official WhatsApp Logo */}
            <div className="flex h-12 w-12 items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-11 w-11 shadow-md shadow-emerald-500/20 rounded-full">
                <path fill="#25D366" d="M24 4C12.95 4 4 12.95 4 24c0 3.53.92 6.85 2.53 9.74L4 44l10.55-2.48A19.86 19.86 0 0 0 24 44c11.05 0 20-8.95 20-20S35.05 4 24 4z"/>
                <path fill="#FFF" d="M35.18 29.54c-.58-.29-3.44-1.7-3.97-1.9-.53-.19-.92-.29-1.31.29-.39.58-1.5 1.9-1.84 2.29-.34.39-.68.44-1.26.15-2.92-1.46-4.83-2.61-6.75-5.91-.51-.88.51-.82 1.46-2.72.16-.32.08-.6-.04-.84-.12-.24-1.07-2.58-1.47-3.53-.39-.93-.78-.8-1.07-.82h-.91c-.31 0-.82.12-1.25.58-.43.47-1.64 1.6-1.64 3.9 0 2.3 1.67 4.52 1.9 4.83.24.31 3.29 5.03 7.98 7.05 2.89 1.25 4.02 1.36 5.46 1.15 1.56-.23 3.44-1.4 3.92-2.76.49-1.36.49-2.52.34-2.76-.15-.24-.53-.39-1.11-.68z"/>
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  Connected
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                WhatsApp Connected: <span className="font-mono text-emerald-800">{displayPhone || "Active"}</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Monitoring incoming Meta ad leads and auto-forwarding to your team in real time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs cursor-pointer disabled:opacity-50"
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
    <section className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 p-5 sm:p-6 neo-panel space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Official WhatsApp Logo */}
          <div className="flex h-12 w-12 items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-11 w-11 shadow-md shadow-emerald-500/20 rounded-full">
              <path fill="#25D366" d="M24 4C12.95 4 4 12.95 4 24c0 3.53.92 6.85 2.53 9.74L4 44l10.55-2.48A19.86 19.86 0 0 0 24 44c11.05 0 20-8.95 20-20S35.05 4 24 4z"/>
              <path fill="#FFF" d="M35.18 29.54c-.58-.29-3.44-1.7-3.97-1.9-.53-.19-.92-.29-1.31.29-.39.58-1.5 1.9-1.84 2.29-.34.39-.68.44-1.26.15-2.92-1.46-4.83-2.61-6.75-5.91-.51-.88.51-.82 1.46-2.72.16-.32.08-.6-.04-.84-.12-.24-1.07-2.58-1.47-3.53-.39-.93-.78-.8-1.07-.82h-.91c-.31 0-.82.12-1.25.58-.43.47-1.64 1.6-1.64 3.9 0 2.3 1.67 4.52 1.9 4.83.24.31 3.29 5.03 7.98 7.05 2.89 1.25 4.02 1.36 5.46 1.15 1.56-.23 3.44-1.4 3.92-2.76.49-1.36.49-2.52.34-2.76-.15-.24-.53-.39-1.11-.68z"/>
            </svg>
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Connect WhatsApp
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-xl leading-relaxed">
              Connect your WhatsApp number to capture Meta Ads leads and forward them in real time.
            </p>
          </div>
        </div>

        {/* SINGLE CLEAN BUTTON */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleConnectWhatsApp}
            disabled={loading}
            className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-xs font-black text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <span>Connect WhatsApp</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-800 shadow-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIVE POP-UP QR CODE MODAL (ALWAYS CLOSES WHEN CONNECTED)                  */}
      {/* ========================================================================= */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-line space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-9 w-9">
                    <path fill="#25D366" d="M24 4C12.95 4 4 12.95 4 24c0 3.53.92 6.85 2.53 9.74L4 44l10.55-2.48A19.86 19.86 0 0 0 24 44c11.05 0 20-8.95 20-20S35.05 4 24 4z"/>
                    <path fill="#FFF" d="M35.18 29.54c-.58-.29-3.44-1.7-3.97-1.9-.53-.19-.92-.29-1.31.29-.39.58-1.5 1.9-1.84 2.29-.34.39-.68.44-1.26.15-2.92-1.46-4.83-2.61-6.75-5.91-.51-.88.51-.82 1.46-2.72.16-.32.08-.6-.04-.84-.12-.24-1.07-2.58-1.47-3.53-.39-.93-.78-.8-1.07-.82h-.91c-.31 0-.82.12-1.25.58-.43.47-1.64 1.6-1.64 3.9 0 2.3 1.67 4.52 1.9 4.83.24.31 3.29 5.03 7.98 7.05 2.89 1.25 4.02 1.36 5.46 1.15 1.56-.23 3.44-1.4 3.92-2.76.49-1.36.49-2.52.34-2.76-.15-.24-.53-.39-1.11-.68z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Scan WhatsApp QR Code
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Point your phone camera to connect
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
                  🎉 WhatsApp Connected!
                </h4>
                <p className="text-xs text-emerald-700 font-bold">
                  Closing pop-up...
                </p>
              </div>
            ) : qrLoading ? (
              <div className="py-12 text-center space-y-4">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-xs font-bold text-slate-700">
                  Loading WhatsApp QR Code...
                </p>
                <p className="text-[10px] text-slate-400">Takes about 2 to 3 seconds</p>
              </div>
            ) : qrError ? (
              <div className="py-6 text-center space-y-4">
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-bold text-rose-800">
                  {qrError}
                </div>
                <button
                  type="button"
                  onClick={handleConnectWhatsApp}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Retry
                </button>
              </div>
            ) : qrDataUrl ? (
              <div className="space-y-4 text-center">
                <div className="relative mx-auto inline-block rounded-3xl p-4 bg-white border-2 border-emerald-500 shadow-xl shadow-emerald-500/10">
                  <img
                    src={qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="h-64 w-64 object-contain rounded-xl select-none"
                  />
                  <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Waiting for camera scan...</span>
                  </div>
                </div>

                {/* Simple 3 Steps */}
                <div className="rounded-2xl bg-slate-50 border border-line p-4 text-left text-xs space-y-1.5">
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
