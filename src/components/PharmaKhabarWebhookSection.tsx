"use client";

import React, { useState, useEffect } from "react";

interface PharmaKhabarWebhookSectionProps {
  companyId: string;
  initialApiKey?: string | null;
}

export function PharmaKhabarWebhookSection({
  companyId,
  initialApiKey = "",
}: PharmaKhabarWebhookSectionProps) {
  const [apiKey, setApiKey] = useState(initialApiKey || "");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [origin, setOrigin] = useState("https://crm.allota.in");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // The official inbound webhook URL on the active domain
  const webhookUrl = `${origin}/api/pharmakhabar/webhook/${companyId}`;

  const isConnected = Boolean(apiKey.trim());

  function handleGenerateKey() {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setApiKey(`pk_live_${randomHex}`);
  }

  function copyToClipboard(text: string, setter: (val: boolean) => void) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  }

  return (
    <div
      id="pharmakhabar"
      className="rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/20 p-5 sm:p-6 neo-panel shadow-sm space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white border border-orange-200 shadow-2xs p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pharmakhabar-icon.png"
              alt="PharmaKhabar Logo"
              className="h-8 w-8 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-ink text-base">
                PharmaKhabar Inbound Webhook
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border ${
                  isConnected
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {isConnected ? "● Ingestion Active" : "⚠️ Key Missing"}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Receive buyer inquiries, franchise leads &amp; monopoly requests instantly into Allota Lead Center.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="https://www.pharmakhabar.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold text-orange-800 shadow-2xs hover:bg-orange-50 transition"
          >
            <span>Open PharmaKhabar Portal</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      {/* Webhook Configuration Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Webhook URL */}
        <div className="rounded-2xl border border-orange-100 bg-white p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🔗</span> Webhook Ingestion URL
            </label>
            <span className="rounded bg-orange-100 text-orange-800 px-2 py-0.5 text-[10px] font-extrabold font-mono">
              POST
            </span>
          </div>
          <p className="text-[11px] text-ink-muted">
            Configure this exact URL in PharmaKhabar supplier settings or webhook integration:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-ink select-all focus:outline-none"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(webhookUrl, setCopiedUrl)}
              className="shrink-0 rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-orange-500 transition cursor-pointer"
            >
              {copiedUrl ? "Copied! ✓" : "Copy URL"}
            </button>
          </div>
        </div>

        {/* Right: Secret Header / Key */}
        <div className="rounded-2xl border border-orange-100 bg-white p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🔑</span> Webhook Secret Key (<code className="text-orange-700">x-api-key</code>)
            </label>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold">
                Header Auth
              </span>
              <button
                type="button"
                onClick={handleGenerateKey}
                className="text-[10px] font-bold text-orange-700 hover:underline"
              >
                Regenerate
              </button>
            </div>
          </div>
          <p className="text-[11px] text-ink-muted">
            Required authentication key for validating incoming webhook payloads:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              name="pharmaKhabarApiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="e.g. ekonmed_pk_9a1c4b7e2f50"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(apiKey, setCopiedKey)}
              disabled={!apiKey}
              className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-ink hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              {copiedKey ? "Copied! ✓" : "Copy Key"}
            </button>
          </div>
        </div>
      </div>

      {/* Recommended Settings Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-orange-100 bg-white/80 p-2.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint block">Method</span>
          <span className="text-xs font-black text-ink mt-0.5 block">POST</span>
        </div>
        <div className="rounded-xl border border-orange-100 bg-white/80 p-2.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint block">Payload Type</span>
          <span className="text-xs font-black text-ink mt-0.5 block">JSON</span>
        </div>
        <div className="rounded-xl border border-orange-100 bg-white/80 p-2.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint block">Header Name</span>
          <span className="text-xs font-black text-orange-700 font-mono mt-0.5 block">x-api-key</span>
        </div>
        <div className="rounded-xl border border-orange-100 bg-white/80 p-2.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint block">Source Attribution</span>
          <span className="text-xs font-black text-orange-700 mt-0.5 block">PharmaKhabar</span>
        </div>
      </div>

      {/* Collapsible Step-by-Step Setup Guide */}
      <div className="rounded-2xl border border-orange-100 bg-white/60 p-4">
        <button
          type="button"
          onClick={() => setShowInstructions(!showInstructions)}
          className="w-full flex items-center justify-between text-left text-xs font-bold text-orange-950 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span>📋</span> How to connect PharmaKhabar Leads (Step-by-Step)
          </span>
          <span className="text-slate-400 font-bold">{showInstructions ? "▲ Hide Guide" : "▼ Show Guide"}</span>
        </button>

        {showInstructions && (
          <div className="mt-3.5 pt-3 border-t border-orange-100 space-y-2.5 text-xs text-ink-muted">
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">1</span>
              <p>Log in to your <strong>PharmaKhabar Supplier / Business Account</strong>.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">2</span>
              <p>Go to your lead delivery / CRM webhook settings, or provide the Webhook URL to your PharmaKhabar account manager.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">3</span>
              <p>Paste the <strong>Webhook Ingestion URL</strong> above into their destination URL slot.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">4</span>
              <p>Set the method to <span className="font-bold text-ink">POST</span> and format to <span className="font-bold text-ink">JSON</span>.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">5</span>
              <p>Pass the Webhook Key either in the <code className="bg-slate-100 px-1 py-0.5 rounded text-orange-700 font-bold">x-api-key</code> header, Authorization Bearer header, or append <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">?key={apiKey || "[Your Key]"}</code> to the URL.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">6</span>
              <p>Save changes in CRM settings. Any incoming enquiry will be allotted immediately via round-robin with the official PharmaKhabar badge!</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
