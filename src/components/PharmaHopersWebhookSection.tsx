"use client";

import React, { useState, useEffect } from "react";
import { SecretInput } from "@/components/SecretInput";

interface PharmaHopersWebhookSectionProps {
  companyId: string;
  initialApiKey?: string | null;
  initialUsername?: string | null;
  initialPassword?: string | null;
}

export function PharmaHopersWebhookSection({
  companyId,
  initialApiKey = "",
  initialUsername = "",
  initialPassword = "",
}: PharmaHopersWebhookSectionProps) {
  const [apiKey, setApiKey] = useState(initialApiKey || "");
  const [username, setUsername] = useState(initialUsername || "");
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
  const webhookUrl = `${origin}/api/pharmahopers/webhook/${companyId}`;

  const isConnected = Boolean(apiKey.trim() || (username.trim() && initialPassword));

  function handleGenerateKey() {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setApiKey(`ph_live_${randomHex}`);
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
      id="pharmahopers"
      className="rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50/40 via-white to-blue-50/20 p-5 sm:p-6 neo-panel shadow-sm space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white border border-sky-200 shadow-2xs p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pharmahopers-icon.png"
              alt="PharmaHopers Logo"
              className="h-8 w-8 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-ink text-base">
                PharmaHopers Integration
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border ${
                  isConnected
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {isConnected ? "● Connected" : "⚠️ Credentials Missing"}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Sync PharmaHopers PCD franchise inquiries &amp; buyer leads directly into Allota Lead Center.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="https://supplier.pharmahopers.com/member/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 shadow-2xs hover:bg-sky-50 transition"
          >
            <span>Open PharmaHopers Portal</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      {/* Primary: PharmaHopers Portal Credentials (Username & Password) */}
      <div className="rounded-2xl border border-sky-200/80 bg-white p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-ink flex items-center gap-1.5">
            <span>🔐</span> PharmaHopers Portal Credentials
          </label>
          <span className="rounded bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 text-[10px] font-bold">
            Portal Sync
          </span>
        </div>
        <p className="text-[11px] text-ink-muted">
          Your PharmaHopers supplier account login details (same as used in your previous CRM):
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-ink">Username / Email</span>
            <input
              type="text"
              name="pharmaHopperUsername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ekonmedremedies@gmail.com"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-ink">Password</span>
            <SecretInput
              name="pharmaHopperPassword"
              defaultValue={initialPassword || ""}
              placeholder="PharmaHopers Password"
            />
          </div>
        </div>
      </div>

      {/* Webhook Configuration Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Webhook URL */}
        <div className="rounded-2xl border border-sky-100 bg-white/70 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🔗</span> Webhook Ingestion URL <span className="text-ink-faint font-normal">(Instant Push)</span>
            </label>
            <span className="rounded bg-sky-100 text-sky-800 px-2 py-0.5 text-[10px] font-extrabold font-mono">
              POST
            </span>
          </div>
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
              className="shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-sky-500 transition cursor-pointer"
            >
              {copiedUrl ? "Copied! ✓" : "Copy URL"}
            </button>
          </div>
        </div>

        {/* Right: Secret Header / Key */}
        <div className="rounded-2xl border border-sky-100 bg-white/70 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🔑</span> Webhook Secret Key (<code className="text-sky-700">x-api-key</code>)
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGenerateKey}
                className="text-[10px] font-bold text-sky-700 hover:underline"
              >
                Regenerate
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              name="pharmaHopperApiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="e.g. ekonmed_ph_8e4b1c2a9f73"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sky-500"
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
    </div>
  );
}
