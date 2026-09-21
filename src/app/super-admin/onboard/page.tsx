"use client";

import { useState } from "react";
import Link from "next/link";
import { onboardCompany } from "@/lib/super-admin-actions";
import { EnterCrmButton } from "@/components/EnterCrmButton";

export default function OnboardCompanyPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<"CORE_LEAD_SUITE" | "PREMIUM_ERP">("CORE_LEAD_SUITE");
  
  // Custom toggles
  const [enableStockIq, setEnableStockIq] = useState(false);
  const [enableTerritories, setEnableTerritories] = useState(false);
  const [enableClients, setEnableClients] = useState(false);

  // Success result
  const [createdResult, setCreatedResult] = useState<{
    companyId: string;
    companyName: string;
    adminEmail: string;
    adminPassword?: string;
  } | null>(null);

  function handlePlanSelect(tier: "CORE_LEAD_SUITE" | "PREMIUM_ERP") {
    setPlanTier(tier);
    if (tier === "PREMIUM_ERP") {
      setEnableStockIq(true);
      setEnableTerritories(true);
      setEnableClients(true);
    } else {
      setEnableStockIq(false);
      setEnableTerritories(false);
      setEnableClients(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("planTier", planTier);
    formData.set("enableStockIq", String(enableStockIq));
    formData.set("enableTerritories", String(enableTerritories));
    formData.set("enableClientsManagement", String(enableClients));
    formData.set("enableReorders", String(planTier === "PREMIUM_ERP"));
    formData.set("enableCreditManagement", String(planTier === "PREMIUM_ERP"));

    const passwordVal = formData.get("adminPassword") as string;

    try {
      const res = await onboardCompany(formData);
      setLoading(false);

      if (res?.error) {
        setError(res.error);
        return;
      }

      if (res?.success && res.companyId) {
        setCreatedResult({
          companyId: res.companyId,
          companyName: res.companyName || "New Company",
          adminEmail: res.adminEmail,
          adminPassword: passwordVal,
        });
      }
    } catch {
      setLoading(false);
      setError("An error occurred while provisioning the business.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/super-admin"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Super Admin Command Center</span>
          </Link>

          <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-300 border border-purple-500/30">
            Rapid Client Provisioning
          </span>
        </div>

        {createdResult ? (
          /* Success Card */
          <div className="rounded-3xl border border-emerald-500/40 bg-slate-950 p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-2xl font-black">
                ✓
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Client Provisioned Successfully!</h1>
                <p className="text-xs text-slate-400">
                  The business workspace and administrator account are fully active and isolated.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">Company Name:</span>
                <span className="text-xs font-bold text-white">{createdResult.companyName}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">Plan Tier:</span>
                <span className="text-xs font-bold text-teal-400">
                  {planTier === "CORE_LEAD_SUITE" ? "Core Lead Suite (₹0 Marg API)" : "Premium ERP Plan"}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">Admin Login Email:</span>
                <span className="text-xs font-mono font-bold text-amber-300">{createdResult.adminEmail}</span>
              </div>
              {createdResult.adminPassword && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Initial Password:</span>
                  <span className="text-xs font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                    {createdResult.adminPassword}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <EnterCrmButton
                companyId={createdResult.companyId}
                companyName={createdResult.companyName}
                className="w-full sm:w-auto justify-center py-2.5 px-5 text-sm"
              />

              <Link
                href="/super-admin"
                className="w-full sm:w-auto text-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
              >
                Return to Directory
              </Link>
            </div>
          </div>
        ) : (
          /* Onboarding Form */
          <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl space-y-8">
            <div>
              <h1 className="text-xl font-black text-white">Onboard New Pharma Business</h1>
              <p className="mt-1 text-xs text-slate-400">
                Setup a new client in under 30 seconds. Choose their plan tier, configure feature toggles, and generate their admin login credentials.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs font-medium text-rose-300">
                {error}
              </div>
            )}

            {/* Step 1: Business Profile */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Step 1: Business Profile
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Apex Health Remedies Pvt Ltd"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company Slug (optional)
                  </label>
                  <input
                    type="text"
                    name="slug"
                    placeholder="e.g. apex-health"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    name="contactPhone"
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Contact Email <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="contactEmail"
                    required
                    placeholder="contact@apexremedies.com"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Plan Selection */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Step 2: Plan Selection & Module Toggles
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Core Lead Suite */}
                <button
                  type="button"
                  onClick={() => handlePlanSelect("CORE_LEAD_SUITE")}
                  className={`flex flex-col text-left rounded-2xl border p-4 transition ${
                    planTier === "CORE_LEAD_SUITE"
                      ? "border-teal-500 bg-teal-950/30 ring-2 ring-teal-500/50"
                      : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Core Lead Suite</span>
                    <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                      ₹0 Marg Cost
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                    Zero Marg/Busy API overhead. Full Lead Center, Lead IQ analytics, Multi-channel Excel Ingestion, Leads Reassign, and Employee Tracking.
                  </p>
                </button>

                {/* Premium ERP Plan */}
                <button
                  type="button"
                  onClick={() => handlePlanSelect("PREMIUM_ERP")}
                  className={`flex flex-col text-left rounded-2xl border p-4 transition ${
                    planTier === "PREMIUM_ERP"
                      ? "border-purple-500 bg-purple-950/30 ring-2 ring-purple-500/50"
                      : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Premium ERP Plan</span>
                    <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                      Marg / Billing API
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                    Full Commercial Suite with Marg/Busy API integration, Stock IQ, Real-time Distributor Billing, Territories, Clients & Ledgers.
                  </p>
                </button>
              </div>

              {/* Granular Module Toggles */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Granular ERP Module Toggles
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableStockIq}
                      onChange={(e) => setEnableStockIq(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-400"
                    />
                    <span className="text-xs text-slate-300">Stock IQ (Inventory)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableTerritories}
                      onChange={(e) => setEnableTerritories(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-400"
                    />
                    <span className="text-xs text-slate-300">Territories / Zones</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableClients}
                      onChange={(e) => setEnableClients(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-400"
                    />
                    <span className="text-xs text-slate-300">Clients / Distributors</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Step 3: Admin User Credentials */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Step 3: Initial Admin Account Credentials
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Admin Name
                  </label>
                  <input
                    type="text"
                    name="adminName"
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Admin Email (Login) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="adminEmail"
                    required
                    placeholder="admin@apexremedies.com"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Initial Password <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    name="adminPassword"
                    required
                    placeholder="••••••••"
                    defaultValue="pharma123"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 4: Integration APIs & Call Storage (Optional) */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                    Step 4: Integration APIs & Cloud Storage (Optional)
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Add API keys and storage links now, or configure them later in Company Settings. All fields are optional.
                  </p>
                </div>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                  Optional
                </span>
              </div>

              {/* Master Google Drive Folder URL */}
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📁</span>
                    <div>
                      <label className="block text-xs font-bold text-white">
                        Master Google Drive Folder Link (AI Call Storage & Transcription)
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Central cloud folder where audio recordings land. CRM organizes them as: <code className="text-blue-300 font-mono text-[10px] bg-slate-900/80 px-1 py-0.5 rounded">Employee Name / YYYY-MM-DD / Recording.mp3</code>
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                    Connected Drive
                  </span>
                </div>
                <input
                  type="url"
                  name="driveFolderUrl"
                  defaultValue="https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3"
                  placeholder="https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Meta Suite (Facebook, Instagram & WhatsApp Business API) - Exact Columns */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                      <span>🌐</span> Meta Suite Integration (Facebook, Instagram & WhatsApp Cloud API)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Meta uses separate credentials for App verification, Lead Ads ingestion, and WhatsApp Cloud API. Fill the exact columns below:
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                    7 Meta Columns
                  </span>
                </div>

                {/* Meta App & Token */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    1. Meta Developer App & Permanent Token
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Meta App ID
                      </label>
                      <input
                        type="text"
                        name="metaAppId"
                        placeholder="e.g. 184729104928172"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">From Meta Developer App Dashboard</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Meta App Secret
                      </label>
                      <input
                        type="password"
                        name="metaAppSecret"
                        placeholder="••••••••••••••••"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">App Settings &gt; Basic &gt; App Secret</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        System User Access Token
                      </label>
                      <input
                        type="password"
                        name="metaAccessToken"
                        placeholder="EAAG... (Never Expiring Token)"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Permanent Token for Lead Ads &amp; WhatsApp</p>
                    </div>
                  </div>
                </div>

                {/* Facebook & Instagram Lead Ads */}
                <div className="pt-2 border-t border-indigo-500/10">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    2. Facebook &amp; Instagram Lead Ads
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Facebook Page ID / Instagram Page ID
                      </label>
                      <input
                        type="text"
                        name="metaPageId"
                        placeholder="e.g. 109283746501928"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Page where PCD Lead Gen forms run</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Meta Ad Account ID (Optional)
                      </label>
                      <input
                        type="text"
                        name="metaAdAccountId"
                        placeholder="act_1234567890123"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">From Meta Ads Manager account</p>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Business Cloud API */}
                <div className="pt-2 border-t border-indigo-500/10">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    3. WhatsApp Business Cloud API (Official Meta API)
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        WhatsApp Business Account ID (WABA ID)
                      </label>
                      <input
                        type="text"
                        name="metaWabaId"
                        placeholder="e.g. 209384756102938"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Found in WhatsApp Manager &gt; Account Settings</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        WhatsApp Phone Number ID
                      </label>
                      <input
                        type="text"
                        name="metaPhoneNumberId"
                        placeholder="e.g. 105928374619283"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Found in WhatsApp Manager &gt; API Setup</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Other Pharma APIs Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* IndiaMART API */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">
                      IndiaMART CRM API Key
                    </label>
                    <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-400 border border-teal-500/20">
                      Leads
                    </span>
                  </div>
                  <input
                    type="text"
                    name="indiaMartApiKey"
                    placeholder="mKey_9x8a7b6c5d4e3f..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">Auto-syncs incoming buyer inquiries into Lead Center.</p>
                </div>

                {/* Billing Software / Marg ERP */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">
                      Billing Software API Key (Marg / Busy)
                    </label>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                      Billing ERP
                    </span>
                  </div>
                  <input
                    type="text"
                    name="billingSoftwareApiKey"
                    placeholder="Marg ERP 9+ API Key / Token"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">Connects live Marg ERP / Busy inventory & distributor balances.</p>
                </div>

                {/* Pharma Hopper API */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">
                      Pharma Hopper API Key
                    </label>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      Portal
                    </span>
                  </div>
                  <input
                    type="text"
                    name="pharmaHopperApiKey"
                    placeholder="ph_live_xxxxxxxxxxxx"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">Syncs leads from PharmaHopper B2B PCD marketplace.</p>
                </div>

                {/* Pharma Vent API */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">
                      Pharma Vent API Key
                    </label>
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-500/20">
                      Portal
                    </span>
                  </div>
                  <input
                    type="text"
                    name="pharmaVentApiKey"
                    placeholder="pv_live_xxxxxxxxxxxx"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">Syncs leads from PharmaVent PCD franchise directory.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <Link
                href="/super-admin"
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-indigo-500 transition disabled:opacity-50"
              >
                {loading ? "Provisioning Company..." : "⚡ Provision Business & Admin →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
