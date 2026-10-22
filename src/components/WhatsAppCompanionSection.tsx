"use client";

import { useState, useEffect } from "react";

export function WhatsAppCompanionSection({ initialPhone }: { initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone || "9996589217");
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("NOT_CONNECTED");
  const [copied, setCopied] = useState(false);

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
            }
          }
        } catch {
          // ignore background polling error
        }
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [pairingCode, status]);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
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
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
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

  return (
    <div className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-50/20 p-6 space-y-5 neo-panel">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
              Live Phone Pairing (Option A)
            </span>
          </div>
          <h3 className="text-base font-black text-ink mt-1.5 flex items-center gap-2">
            <span>📱</span> WhatsApp Business Phone Companion Link
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Keep WhatsApp 100% active on your physical phone while Allota captures every ad lead automatically.
          </p>
        </div>

        <div className="shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              status === "CONNECTED"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : status === "PAIRING_REQUESTED"
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-slate-100 text-ink-muted border border-slate-200"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === "CONNECTED" ? "bg-emerald-500" : status === "PAIRING_REQUESTED" ? "bg-amber-500" : "bg-slate-400"
              }`}
            />
            {status === "CONNECTED"
              ? "● Connected to Phone"
              : status === "PAIRING_REQUESTED"
              ? "Waiting for Code on Phone..."
              : "Not Linked"}
          </span>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleRequestCode} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-ink mb-1.5">
              WhatsApp Business Mobile Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-xs font-bold text-ink-faint">
                🇮🇳 +91
              </span>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9996589217"
                className="w-full rounded-2xl border border-line bg-white pl-16 pr-4 py-2.5 text-xs font-bold text-ink placeholder:text-ink-faint focus:outline-emerald-600 focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto rounded-2xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {loading ? "Requesting Pairing Code..." : "📲 Get 8-Digit Pairing Code"}
          </button>
        </div>
      </form>

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {/* Pairing Code Card */}
      {pairingCode && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="text-center space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
              Your 8-Character Pairing Code
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-700 bg-emerald-50 px-5 py-2 rounded-2xl border border-emerald-300 select-all">
                {pairingCode}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <p className="text-[11px] text-ink-faint pt-1">
              Valid for 2 minutes. Enter this code on your WhatsApp mobile app:
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-line text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-line">
              <span className="font-black text-emerald-600 block text-sm">Step 1</span>
              <p className="font-semibold text-ink mt-0.5">Open WhatsApp</p>
              <p className="text-[10px] text-ink-muted">On {phone}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-line">
              <span className="font-black text-emerald-600 block text-sm">Step 2</span>
              <p className="font-semibold text-ink mt-0.5">Linked Devices</p>
              <p className="text-[10px] text-ink-muted">Settings ➔ Linked Devices</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-line">
              <span className="font-black text-emerald-600 block text-sm">Step 3</span>
              <p className="font-semibold text-ink mt-0.5">Tap Phone Link</p>
              <p className="text-[10px] text-ink-muted">&ldquo;Link with phone number instead&rdquo;</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-line">
              <span className="font-black text-emerald-600 block text-sm">Step 4</span>
              <p className="font-semibold text-ink mt-0.5">Enter Code</p>
              <p className="text-[10px] text-emerald-700 font-mono font-bold">{pairingCode}</p>
            </div>
          </div>
        </div>
      )}

      {/* Connected Success Banner */}
      {status === "CONNECTED" && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-100/60 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-xs font-black text-emerald-900">Phone Successfully Linked &amp; Active!</p>
              <p className="text-[11px] text-emerald-700">
                All incoming Click-to-WhatsApp ad leads will now be captured into Allota CRM in real time.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
