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
  onClose,
}: {
  initialPhone?: string;
  initialConnected?: boolean;
  initialConnectedPhone?: string;
  onClose?: () => void;
}) {
  const rawInitial = cleanDigits(initialPhone || initialConnectedPhone).replace(/^91/, "");
  const initialLocalPhone = rawInitial === "9800000000" ? "" : rawInitial;

  const [phone, setPhone] = useState(initialLocalPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(initialConnected ? "CONNECTED" : "NOT_CONNECTED");
  const [connectedPhone, setConnectedPhone] = useState<string | null>(
    initialConnected ? (initialConnectedPhone || null) : null
  );

  // Live Pop-up Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [pairingMethod, setPairingMethod] = useState<"code" | "qr">("code");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
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

  async function fetchPairingCode(customPhone?: string) {
    const rawTarget = (customPhone ?? phone).replace(/\D/g, "");
    if (!rawTarget || rawTarget.length < 10) {
      setQrError("Please enter your 10-digit WhatsApp phone number first.");
      return;
    }
    setCodeLoading(true);
    setQrError(null);
    try {
      const tenDigits = rawTarget.slice(-10);
      const fullTarget = `91${tenDigits}`;

      const res = await fetch("/api/whatsapp-companion/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "code", phone: fullTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate pairing code.");

      if (data.status === "CONNECTED" || data.alreadyRegistered) {
        setStatus("CONNECTED");
        if (data.phone) setConnectedPhone(data.phone);
        setQrModalOpen(false);
      } else if (data.pairingCode) {
        setPairingCode(data.pairingCode);
      }
    } catch (err: any) {
      setQrError(err?.message || "Failed to generate pairing code. Please try again.");
    } finally {
      setCodeLoading(false);
    }
  }

  async function fetchQrCode() {
    setQrLoading(true);
    setQrError(null);
    try {
      const res = await fetch("/api/whatsapp-companion/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "qr" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load live QR code.");

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

  // Single Click Action: Connect WhatsApp (Opens official modal)
  async function handleConnectWhatsApp() {
    setError(null);
    setQrModalOpen(true);
    setQrError(null);
    setJustConnected(false);

    if (pairingMethod === "code") {
      if (phone && phone.replace(/\D/g, "").length >= 10) {
        await fetchPairingCode();
      }
    } else {
      await fetchQrCode();
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
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 transition cursor-pointer shadow-2xs"
          >
            ✕
          </button>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Official WhatsApp Logo */}
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-emerald-200/80 shadow-xs shrink-0 p-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-8 w-8 shrink-0">
                <path fill="#25D366" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/>
                <path fill="#fff" d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.27-.2-.57-.35z"/>
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  Connected
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 whitespace-nowrap">
                WhatsApp Connected: <span className="font-mono text-emerald-800">{displayPhone || "Active"}</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setStatus("NOT_CONNECTED");
                setPairingCode(null);
                setQrModalOpen(true);
              }}
              className="rounded-2xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition shadow-xs cursor-pointer"
            >
              Change Number
            </button>
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
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer shadow-2xs"
        >
          ✕
        </button>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Official WhatsApp Logo */}
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-emerald-200/80 shadow-xs shrink-0 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-7 w-7 shrink-0">
              <path fill="#25D366" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/>
              <path fill="#fff" d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.27-.2-.57-.35z"/>
            </svg>
          </div>

          <h3 className="text-base sm:text-lg font-black text-slate-900 whitespace-nowrap">
            Connect WhatsApp
          </h3>
        </div>

        {/* PHONE INPUT & CONNECT BUTTON */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex items-center rounded-2xl border border-slate-300 bg-white shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
            <span className="pl-3.5 pr-2 text-xs font-bold text-slate-600 select-none whitespace-nowrap flex items-center gap-1.5 shrink-0">
              <span className="text-sm leading-none">🇮🇳</span>
              <span>+91</span>
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setPhone(val);
                setPairingCode(null);
              }}
              placeholder="10-digit number"
              className="w-full sm:w-36 py-2.5 pr-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none tracking-wider"
              maxLength={10}
            />
          </div>

          <button
            type="button"
            onClick={handleConnectWhatsApp}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
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
                    Connect WhatsApp
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Choose 8-digit code or QR camera scan
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

            {/* TAB SELECTOR: 8-DIGIT CODE (RECOMMENDED) VS QR CODE */}
            <div className="flex rounded-2xl bg-slate-100 p-1 border border-line text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setPairingMethod("code");
                  if (!pairingCode) fetchPairingCode();
                }}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  pairingMethod === "code"
                    ? "bg-white text-emerald-700 shadow-xs font-extrabold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>📱 8-Digit Code</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-black">
                  Recommended
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPairingMethod("qr");
                  if (!qrDataUrl) fetchQrCode();
                }}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  pairingMethod === "qr"
                    ? "bg-white text-emerald-700 shadow-xs font-extrabold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>📷 Scan QR</span>
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
            ) : qrError ? (
              <div className="py-6 text-center space-y-4">
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-bold text-rose-800">
                  {qrError}
                </div>
                <button
                  type="button"
                  onClick={() => (pairingMethod === "code" ? fetchPairingCode() : fetchQrCode())}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Retry
                </button>
              </div>
            ) : pairingMethod === "code" ? (
              <div className="space-y-4 text-center">
                <div className="rounded-3xl p-5 bg-gradient-to-b from-emerald-50/50 to-teal-50/30 border border-emerald-500/30 space-y-4">
                  {/* Phone input row inside modal */}
                  <div className="text-left space-y-1">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      WhatsApp Phone Number (10 digits)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 flex items-center rounded-xl border border-emerald-300 bg-white px-3 py-2 shadow-xs focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20">
                        <span className="text-xs font-bold text-slate-500 mr-1.5 select-none">🇮🇳 +91</span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setPhone(val);
                            setPairingCode(null);
                          }}
                          placeholder="e.g. 9876543210"
                          className="w-full text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none tracking-wider"
                          maxLength={10}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchPairingCode(phone)}
                        disabled={codeLoading || phone.length < 10}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {codeLoading ? "Requesting..." : pairingCode ? "New Code" : "Get Code"}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-slate-700">
                    Enter this 8-digit code in WhatsApp on your phone:
                  </p>

                  {codeLoading ? (
                    <div className="py-6 flex flex-col items-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
                      <span className="text-xs text-slate-500 font-medium">Requesting code from WhatsApp...</span>
                    </div>
                  ) : pairingCode ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-700 bg-white px-5 py-3 rounded-2xl border-2 border-emerald-500 shadow-md">
                        {pairingCode.length === 8
                          ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}`
                          : pairingCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(pairingCode);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        className="rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 shadow-xs transition cursor-pointer"
                        title="Copy Code"
                      >
                        {copiedCode ? "✓ Copied" : "📋 Copy"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fetchPairingCode()}
                      disabled={phone.length < 10}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      Generate 8-Digit Code
                    </button>
                  )}

                  <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Waiting for phone confirmation...</span>
                  </div>
                </div>

                {/* Steps */}
                <div className="rounded-2xl bg-slate-50 border border-line p-4 text-left text-xs space-y-1.5">
                  <p className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                    How to enter code on your phone:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-medium">
                    <li>Open <strong>WhatsApp</strong> on your primary phone.</li>
                    <li>Go to <strong>Settings</strong> (iPhone) or <strong>3 dots</strong> (Android) ➔ <strong>Linked Devices</strong>.</li>
                    <li>Tap <strong>Link a Device</strong>.</li>
                    <li>At the bottom of the camera screen, tap <strong className="text-emerald-700">"Link with phone number instead"</strong>.</li>
                    <li>Enter the 8-digit code shown above.</li>
                  </ol>
                </div>
              </div>
            ) : qrLoading ? (
              <div className="py-12 text-center space-y-4">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-xs font-bold text-slate-700">
                  Loading WhatsApp QR Code...
                </p>
                <p className="text-[10px] text-slate-400">Takes about 2 to 3 seconds</p>
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
