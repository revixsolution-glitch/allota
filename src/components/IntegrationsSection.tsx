"use client";

import React, { useState, useEffect } from "react";
import { SecretInput } from "@/components/SecretInput";
import { PharmaHopersWebhookSection } from "@/components/PharmaHopersWebhookSection";
import { PharmaKhabarWebhookSection } from "@/components/PharmaKhabarWebhookSection";

interface IntegrationsSectionProps {
  companyId: string;
  settings: {
    driveFolderUrl?: string | null;
    geminiApiKey?: string | null;
    metaAppId?: string | null;
    metaAppSecret?: string | null;
    metaAccessToken?: string | null;
    metaPageId?: string | null;
    metaAdAccountId?: string | null;
    metaWabaId?: string | null;
    metaPhoneNumberId?: string | null;
    metaApiKey?: string | null;
    pharmaHopperApiKey?: string | null;
    pharmaHopperUsername?: string | null;
    pharmaHopperPassword?: string | null;
    pharmaKhabarApiKey?: string | null;
    indiaMartApiKey?: string | null;
    billingSoftwareApiKey?: string | null;
  };
}

type SourceKey = "pharmahopers" | "pharmakhabar" | "meta" | "indiamart" | "drive_ai" | "billing";

export function IntegrationsSection({ companyId, settings }: IntegrationsSectionProps) {
  const isPharmaHopersConnected = Boolean(
    settings.pharmaHopperApiKey || (settings.pharmaHopperUsername && settings.pharmaHopperPassword)
  );
  const isPharmaKhabarConnected = Boolean(settings.pharmaKhabarApiKey);
  const isMetaConnected = Boolean(
    settings.metaAppId && (settings.metaAccessToken || settings.metaApiKey)
  );
  const isIndiaMartConnected = Boolean(settings.indiaMartApiKey);
  const isDriveAiConnected = Boolean(settings.driveFolderUrl || settings.geminiApiKey);
  const isBillingConnected = Boolean(settings.billingSoftwareApiKey);

  // By default, open PharmaKhabar or PharmaHopers if targeted by hash, otherwise start with a clean accordion
  const [openSources, setOpenSources] = useState<Record<SourceKey, boolean>>({
    pharmakhabar: false,
    pharmahopers: false,
    meta: false,
    indiamart: false,
    drive_ai: false,
    billing: false,
  });

  const [selectedDropdown, setSelectedDropdown] = useState<string>("none");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.toLowerCase().replace("#", "");
      if (hash === "pharmakhabar") {
        setOpenSources((prev) => ({ ...prev, pharmakhabar: true }));
        setSelectedDropdown("pharmakhabar");
      } else if (hash === "pharmahopers" || hash === "pharmahopper") {
        setOpenSources((prev) => ({ ...prev, pharmahopers: true }));
        setSelectedDropdown("pharmahopers");
      } else if (hash === "meta" || hash === "facebook") {
        setOpenSources((prev) => ({ ...prev, meta: true }));
        setSelectedDropdown("meta");
      } else if (hash === "indiamart") {
        setOpenSources((prev) => ({ ...prev, indiamart: true }));
        setSelectedDropdown("indiamart");
      }
    }
  }, []);

  function toggleSource(key: SourceKey) {
    setOpenSources((prev) => {
      const nextState = !prev[key];
      const updated = { ...prev, [key]: nextState };
      // Sync dropdown label
      const activeKeys = Object.entries(updated).filter(([, v]) => v).map(([k]) => k);
      if (activeKeys.length === 1) {
        setSelectedDropdown(activeKeys[0]);
      } else if (activeKeys.length === 6) {
        setSelectedDropdown("all");
      } else if (activeKeys.length === 0) {
        setSelectedDropdown("none");
      } else {
        setSelectedDropdown("custom");
      }
      return updated;
    });
  }

  function handleDropdownChange(val: string) {
    setSelectedDropdown(val);
    if (val === "all") {
      setOpenSources({
        pharmakhabar: true,
        pharmahopers: true,
        meta: true,
        indiamart: true,
        drive_ai: true,
        billing: true,
      });
    } else if (val === "none") {
      setOpenSources({
        pharmakhabar: false,
        pharmahopers: false,
        meta: false,
        indiamart: false,
        drive_ai: false,
        billing: false,
      });
    } else {
      // Focus strictly on the selected source dropdown
      setOpenSources({
        pharmakhabar: val === "pharmakhabar",
        pharmahopers: val === "pharmahopers",
        meta: val === "meta",
        indiamart: val === "indiamart",
        drive_ai: val === "drive_ai",
        billing: val === "billing",
      });
      // Scroll to element
      setTimeout(() => {
        const el = document.getElementById(val);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }

  return (
    <section className="rounded-3xl p-5 sm:p-6 neo-panel bg-white border border-line border-t-2 border-t-blue-500 space-y-5">
      {/* Section Header & Source Selector Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="font-extrabold text-ink text-sm sm:text-base flex items-center gap-2">
            <span>☁️</span> Cloud Storage &amp; Third-Party Integrations
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Select a source from the dropdown or click any card below to expand and edit credentials.
          </p>
        </div>

        {/* Source Dropdown Picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-ink shrink-0 hidden md:inline-block">
            Open Source:
          </label>
          <div className="relative">
            <select
              value={selectedDropdown}
              onChange={(e) => handleDropdownChange(e.target.value)}
              className="appearance-none rounded-xl border border-line bg-slate-50 pl-3 pr-8 py-2 text-xs font-bold text-ink shadow-2xs hover:bg-slate-100 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">-- Select Source to Configure --</option>
              <option value="pharmakhabar">📰 PharmaKhabar Portal</option>
              <option value="pharmahopers">💊 PharmaHopers Portal</option>
              <option value="meta">🌐 Meta Suite (Facebook / Instagram / WhatsApp)</option>
              <option value="indiamart">🛒 IndiaMART BuyLead</option>
              <option value="drive_ai">📁 Google Drive &amp; AI Engine</option>
              <option value="billing">🧾 Marg ERP / Billing Software</option>
              <option value="all">📂 Expand All Sources</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* Accordion Cards List */}
      <div className="space-y-3.5">
        {/* 1. PharmaKhabar Portal */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("pharmakhabar")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-orange-50/50 via-white to-amber-50/30 hover:bg-orange-50/80 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-orange-200 shadow-2xs p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pharmakhabar-icon.png" alt="PharmaKhabar" className="h-7 w-7 object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">PharmaKhabar Portal</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isPharmaKhabarConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {isPharmaKhabarConnected ? "● Connected" : "⚠️ Key Missing"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Direct API key integration &amp; franchise lead ingestion</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-orange-800">
              <span className="hidden sm:inline-block">{openSources.pharmakhabar ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.pharmakhabar ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.pharmakhabar ? "block" : "none" }} className="border-t border-orange-100 p-4 sm:p-5 bg-white">
            <PharmaKhabarWebhookSection
              companyId={companyId}
              initialApiKey={settings.pharmaKhabarApiKey}
            />
          </div>
        </div>

        {/* 2. PharmaHopers Portal */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("pharmahopers")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-sky-50/50 via-white to-blue-50/30 hover:bg-sky-50/80 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-sky-200 shadow-2xs p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pharmahopers-icon.png" alt="PharmaHopers" className="h-7 w-7 object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">PharmaHopers Portal</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isPharmaHopersConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {isPharmaHopersConnected ? "● Connected" : "⚠️ Credentials Missing"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Portal credentials (Username &amp; Password) &amp; Webhook</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
              <span className="hidden sm:inline-block">{openSources.pharmahopers ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.pharmahopers ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.pharmahopers ? "block" : "none" }} className="border-t border-sky-100 p-4 sm:p-5 bg-white">
            <PharmaHopersWebhookSection
              companyId={companyId}
              initialApiKey={settings.pharmaHopperApiKey}
              initialUsername={settings.pharmaHopperUsername}
              initialPassword={settings.pharmaHopperPassword}
            />
          </div>
        </div>

        {/* 3. Meta Suite (Facebook, Instagram & WhatsApp Business) */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("meta")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-indigo-50/50 via-white to-blue-50/30 hover:bg-indigo-50/80 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-blue-200 shadow-2xs p-1.5">
                <svg viewBox="0 0 24 24" fill="#0081FB" className="h-6 w-6 shrink-0" aria-label="Meta">
                  <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">Meta Suite (Facebook, Instagram &amp; WhatsApp)</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isMetaConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {isMetaConnected ? "● Connected" : "⚠️ Needs Setup"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Lead Ads ingestion, Page forms &amp; WhatsApp Cloud API</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-800">
              <span className="hidden sm:inline-block">{openSources.meta ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.meta ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.meta ? "block" : "none" }} className="border-t border-indigo-100 p-4 sm:p-5 bg-white space-y-4">
            {/* Meta App & Token */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Meta App ID</label>
                <input
                  type="text"
                  name="metaAppId"
                  defaultValue={settings.metaAppId || ""}
                  placeholder="e.g. 1234567890123456"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
                <p className="text-[10px] text-ink-faint mt-1">From Meta App Dashboard</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Meta App Secret</label>
                <SecretInput
                  name="metaAppSecret"
                  defaultValue={settings.metaAppSecret || ""}
                  placeholder="e.g. 0123456789abcdef0123456789abcdef"
                />
                <p className="text-[10px] text-ink-faint mt-1">App Settings &gt; Basic</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">System User Access Token</label>
                <SecretInput
                  name="metaAccessToken"
                  defaultValue={settings.metaAccessToken || settings.metaApiKey || ""}
                  placeholder="EAAG... (Never Expiring)"
                />
                <p className="text-[10px] text-ink-faint mt-1">Meta Business Suite System User</p>
              </div>
            </div>

            {/* Facebook Page & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-indigo-100">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Facebook Page ID</label>
                <input
                  type="text"
                  name="metaPageId"
                  defaultValue={settings.metaPageId || ""}
                  placeholder="e.g. 1342042688984003"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
                <p className="text-[10px] text-ink-faint mt-1">Lead Ads source page</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Meta Ad Account ID (Optional)</label>
                <input
                  type="text"
                  name="metaAdAccountId"
                  defaultValue={settings.metaAdAccountId || ""}
                  placeholder="act_1090397703391043"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
                <p className="text-[10px] text-ink-faint mt-1">From Ads Manager</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">WhatsApp WABA ID</label>
                <input
                  type="text"
                  name="metaWabaId"
                  defaultValue={settings.metaWabaId || ""}
                  placeholder="e.g. 1580714120422358"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
                <p className="text-[10px] text-ink-faint mt-1">WhatsApp Business Account ID</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">WhatsApp Phone Number ID</label>
                <input
                  type="text"
                  name="metaPhoneNumberId"
                  defaultValue={settings.metaPhoneNumberId || ""}
                  placeholder="e.g. 1419772201212771"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
                <p className="text-[10px] text-ink-faint mt-1">API Setup Phone Number ID</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. IndiaMART BuyLead */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("indiamart")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-amber-50/50 via-white to-yellow-50/30 hover:bg-amber-50/80 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-amber-200 shadow-2xs p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/indiamart-icon.png" alt="IndiaMART" className="h-7 w-7 object-contain rounded-xs" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">IndiaMART BuyLead</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isIndiaMartConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {isIndiaMartConnected ? "● Connected" : "⚠️ Key Missing"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Automated buyer inquiries &amp; PCD franchise push API</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
              <span className="hidden sm:inline-block">{openSources.indiamart ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.indiamart ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.indiamart ? "block" : "none" }} className="border-t border-amber-100 p-4 sm:p-5 bg-white space-y-2">
            <label className="block text-xs font-bold text-ink">
              IndiaMART CRM Push API Key
            </label>
            <p className="text-[11px] text-ink-muted">
              Key provided in your IndiaMART Seller Panel under <em>Settings &gt; CRM Integration Key</em>.
            </p>
            <SecretInput
              name="indiaMartApiKey"
              defaultValue={settings.indiaMartApiKey || ""}
              placeholder="e.g. mKey_9x8a7b6c5d4e3f..."
            />
          </div>
        </div>

        {/* 5. Google Drive Storage & AI Intelligence */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("drive_ai")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-blue-50/50 via-white to-emerald-50/30 hover:bg-blue-50/80 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-blue-200 shadow-2xs p-1.5">
                <svg viewBox="0 0 87.3 78" className="h-6 w-6 shrink-0" aria-label="Google Drive">
                  <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"/>
                  <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"/>
                  <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z"/>
                  <path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/>
                  <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/>
                  <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">Google Drive &amp; AI Intelligence</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isDriveAiConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-800 border-slate-200"
                    }`}
                  >
                    {isDriveAiConnected ? "● Connected" : "Using Default"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Call audio recording folder sync &amp; transcription AI keys</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-800">
              <span className="hidden sm:inline-block">{openSources.drive_ai ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.drive_ai ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.drive_ai ? "block" : "none" }} className="border-t border-blue-100 p-4 sm:p-5 bg-white space-y-4">
            {/* Drive Folder */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
                <span>📁</span> Master Google Drive Folder Link (Call Recording Sync)
              </label>
              <p className="text-[11px] text-ink-muted">
                Central Drive folder where phone recordings land. Format: <code className="text-primary font-mono text-[10px]">Employee Name / YYYY-MM-DD / Recording.mp3</code>
              </p>
              <input
                type="url"
                name="driveFolderUrl"
                defaultValue={settings.driveFolderUrl || "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3"}
                placeholder="https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3"
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            </div>

            {/* AI API Key */}
            <div className="space-y-1.5 pt-3 border-t border-line">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>✨</span> API Key for AI use (Call Summarization &amp; Intelligence)
                </label>
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                  {settings.geminiApiKey ? "Custom Key Active" : "Using System Key"}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Custom API key for this organization&apos;s audio call transcription, doctor intent scoring, and AI chat.
              </p>
              <SecretInput
                name="geminiApiKey"
                defaultValue={settings.geminiApiKey || ""}
                placeholder="Enter API key for AI use..."
              />
            </div>
          </div>
        </div>

        {/* 6. Marg ERP / Billing Software */}
        <div className="rounded-3xl border border-line bg-white shadow-2xs overflow-hidden transition">
          <button
            type="button"
            onClick={() => toggleSource("billing")}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-gray-50 hover:bg-slate-100/70 transition text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-2xs p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marg-icon.png" alt="Marg ERP" className="h-7 w-7 object-contain rounded-xs" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-ink text-sm sm:text-base">Marg ERP / Billing Software Key</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                      isBillingConnected
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {isBillingConnected ? "● Connected" : "Optional"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">Ledger syncing, invoice sync &amp; outstanding balances</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="hidden sm:inline-block">{openSources.billing ? "Collapse" : "Configure"}</span>
              <span className="text-slate-400">{openSources.billing ? "▲" : "▼"}</span>
            </div>
          </button>
          <div style={{ display: openSources.billing ? "block" : "none" }} className="border-t border-slate-100 p-4 sm:p-5 bg-white space-y-2">
            <label className="block text-xs font-bold text-ink">
              Marg ERP 9+ Token / API Key
            </label>
            <SecretInput
              name="billingSoftwareApiKey"
              defaultValue={settings.billingSoftwareApiKey || ""}
              placeholder="Marg ERP 9+ Token"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
