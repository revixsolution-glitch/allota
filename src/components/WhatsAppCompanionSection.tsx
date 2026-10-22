"use client";

import { useState, useEffect } from "react";

export function WhatsAppCompanionSection({ initialPhone }: { initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone || "9996589217");
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("LOADING");
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check initial status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/whatsapp-companion/pair");
        const data = await res.json();
        if (data?.status) {
          setStatus(data.status);
          if (data.phone) {
            setConnectedPhone(data.phone);
          }
        }
      } catch {
        setStatus("NOT_CONNECTED");
      }
    }
    checkStatus();
  }, []);

  // Poll status when pairing code is active
  useEffect(() => {
    let interval: any;
    if (pairingCode || status === "PAIRING_REQUESTED") {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/whatsapp-companion/pair");
          const data = await res.json();
          if (data?.status) {
            setStatus(data.status);
            if (data.status === "CONNECTED") {
              setPairingCode(null);
              if (data.phone) setConnectedPhone(data.phone);
            }
          }
        } catch {
          // ignore
        }
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [pairingCode, status]);

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
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate pairing code.");
      }

      if (data.pairingCode) {
        setPairingCode(data.pairingCode);
        setStatus("PAIRING_REQUESTED");
      } else if (data.alreadyRegistered) {
        setStatus("CONNECTED");
        if (data.phone) setConnectedPhone(data.phone);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect this WhatsApp number?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp-companion/pair", { method: "DELETE" });
      setStatus("NOT_CONNECTED");
      setConnectedPhone(null);
      setPairingCode(null);
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

  // 1. SLEEK CONNECTED STATE
  if (status === "CONNECTED") {
    const displayPhone = connectedPhone
      ? (connectedPhone.startsWith("91") ? `+91 ${connectedPhone.slice(2)}` : `+${connectedPhone}`)
      : `+91 ${phone}`;

    return (
      <section className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/10 p-5 sm:p-6 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20 backdrop-blur-md transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Official WhatsApp Logo */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md shadow-emerald-500/20 border border-emerald-200">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 fill-[#25D366]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12.004 2C6.48 2 2 6.48 2 12.004c0 1.956.564 3.784 1.54 5.332L2.2 21.8l4.636-1.308A9.957 9.957 0 0012.004 22c5.524 0 10.004-4.48 10.004-9.996C22.008 6.48 17.528 2 12.004 2zm5.836 14.152c-.244.688-1.424 1.32-1.988 1.396-.54.076-1.22.108-3.924-.984-3.468-1.396-5.712-4.94-5.888-5.172-.172-.232-1.408-1.876-1.408-3.576 0-1.7 1.048-2.536 1.424-2.884.288-.268.664-.336.888-.336.22 0 .444.004.636.012.204.012.48-.076.748.568.28.672.952 2.324 1.036 2.496.084.172.14.376.028.608-.108.232-.164.376-.328.568-.164.192-.344.428-.492.576-.164.164-.336.344-.144.672.192.328.852 1.4 1.824 2.268 1.256 1.116 2.312 1.464 2.64 1.628.328.164.52.14.712-.08.192-.224.82-.952 1.04-1.28.22-.328.444-.272.748-.164.304.108 1.932.912 2.264 1.076.336.164.56.244.64.38.084.136.084.788-.16 1.476z" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-900">
                  WhatsApp connection
                </h2>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs font-semibold text-emerald-900 mt-0.5">
                Active on {displayPhone} · Receiving Meta Ad Leads
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-black text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-600/20">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              Connected
            </span>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="text-xs font-bold text-slate-400 hover:text-rose-600 transition px-2 py-1 cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 2. DISCONNECTED / PAIRING STATE
  return (
    <section className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/10 p-6 sm:p-7 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20 backdrop-blur-md space-y-5 transition-all">
      {/* Decorative Glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-5">
        <div className="flex items-start gap-3.5">
          {/* Official WhatsApp SVG Logo */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md shadow-emerald-500/20 border border-emerald-200">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 fill-[#25D366]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.004 2C6.48 2 2 6.48 2 12.004c0 1.956.564 3.784 1.54 5.332L2.2 21.8l4.636-1.308A9.957 9.957 0 0012.004 22c5.524 0 10.004-4.48 10.004-9.996C22.008 6.48 17.528 2 12.004 2zm5.836 14.152c-.244.688-1.424 1.32-1.988 1.396-.54.076-1.22.108-3.924-.984-3.468-1.396-5.712-4.94-5.888-5.172-.172-.232-1.408-1.876-1.408-3.576 0-1.7 1.048-2.536 1.424-2.884.288-.268.664-.336.888-.336.22 0 .444.004.636.012.204.012.48-.076.748.568.28.672.952 2.324 1.036 2.496.084.172.14.376.028.608-.108.232-.164.376-.328.568-.164.192-.344.428-.492.576-.164.164-.336.344-.144.672.192.328.852 1.4 1.824 2.268 1.256 1.116 2.312 1.464 2.64 1.628.328.164.52.14.712-.08.192-.224.82-.952 1.04-1.28.22-.328.444-.272.748-.164.304.108 1.932.912 2.264 1.076.336.164.56.244.64.38.084.136.084.788-.16 1.476z" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                WhatsApp connection
              </h2>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="mt-1 text-xs sm:text-sm font-semibold text-emerald-950/80 leading-relaxed max-w-2xl">
              <span className="font-extrabold text-emerald-900">Note:</span> If you have active WhatsApp ads on Meta, you must connect here to get your leads in the CRM.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs ${
              status === "PAIRING_REQUESTED"
                ? "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                : "bg-white/80 text-slate-700 border border-slate-200"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === "PAIRING_REQUESTED" ? "bg-amber-600" : "bg-slate-400"
              }`}
            />
            {status === "PAIRING_REQUESTED"
              ? "Waiting for Code on Phone..."
              : "Ready to Connect"}
          </span>
        </div>
      </div>

      {/* Input Form */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              WhatsApp Business Mobile Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-xs font-bold text-slate-500">
                🇮🇳 +91
              </span>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRequestCode();
                  }
                }}
                placeholder="9996589217"
                className="w-full rounded-2xl border border-emerald-300/80 bg-white/90 pl-16 pr-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 shadow-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestCode}
            disabled={loading}
            className="w-full sm:w-auto rounded-2xl bg-emerald-600 px-7 py-3 text-xs font-extrabold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 active:scale-98 transition disabled:opacity-50 cursor-pointer shrink-0 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Requesting Code...</span>
              </>
            ) : (
              <>
                <span>📲</span>
                <span>Get 8-Digit Pairing Code</span>
              </>
            )}
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
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-6 space-y-5 shadow-lg shadow-emerald-500/10 animate-in fade-in duration-200">
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
              Valid for 2 minutes. Enter this code into WhatsApp on your mobile phone:
            </p>
          </div>

          {/* 4 Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="rounded-2xl bg-emerald-50/50 p-3.5 border border-emerald-200/70">
              <span className="font-black text-emerald-700 block text-sm">Step 1</span>
              <p className="font-bold text-slate-900 mt-0.5">Open WhatsApp</p>
              <p className="text-[10px] text-slate-500 mt-0.5">On phone +91 {phone}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50/50 p-3.5 border border-emerald-200/70">
              <span className="font-black text-emerald-700 block text-sm">Step 2</span>
              <p className="font-bold text-slate-900 mt-0.5">Linked Devices</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Settings ➔ Linked Devices</p>
            </div>
            <div className="rounded-2xl bg-emerald-50/50 p-3.5 border border-emerald-200/70">
              <span className="font-black text-emerald-700 block text-sm">Step 3</span>
              <p className="font-bold text-slate-900 mt-0.5">Link Phone</p>
              <p className="text-[10px] text-slate-500 mt-0.5">&ldquo;Link with phone number instead&rdquo;</p>
            </div>
            <div className="rounded-2xl bg-emerald-50/50 p-3.5 border border-emerald-200/70">
              <span className="font-black text-emerald-700 block text-sm">Step 4</span>
              <p className="font-bold text-slate-900 mt-0.5">Type Code</p>
              <p className="text-[11px] text-emerald-800 font-mono font-bold mt-0.5">{pairingCode}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
