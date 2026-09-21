import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { updateCompanyPlanSettings } from "@/lib/admin-actions";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";
import { UpgradePlanCard } from "@/components/UpgradePlanCard";

export default async function AdminSettingsPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  await ensureCompanySettingsColumns();

  let settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
      })
    : null;

  if (!settings) {
    settings = await prisma.companySettings.findFirst({
      where: { id: "default" },
    });
  }

  if (!settings) {
    settings = await prisma.companySettings.create({
      data: {
        id: "default",
        companyName: "Allota AI",
        planTier: "CORE_LEAD_SUITE",
        enableBillingErp: false,
        enableStockIq: false,
        enableReorders: false,
        enableCreditManagement: false,
        enableClientsManagement: false,
        enableTerritories: false,
        enableLeadCenter: true,
        enableLeadsAllotment: true,
        enableLeadsReassign: true,
        enableLeadsIq: true,
        enableSourcesHub: true,
        enableBulkExcelUpload: true,
        enableEmployeeTracking: true,
        companyId: activeCompanyId,
      },
    });
  }

  const company = activeCompanyId
    ? await prisma.company.findUnique({
        where: { id: activeCompanyId },
      })
    : null;

  const activePlanTier = company?.planTier || settings.planTier || "CORE_LEAD_SUITE";
  const isCore =
    activePlanTier === "CORE_LEAD_SUITE" ||
    (!settings.enableBillingErp && !settings.enableStockIq && !settings.enableClientsManagement);

  return (
    <div className="space-y-7 max-w-6xl mx-auto">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary/60 bg-white">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                {isSuperAdmin ? "Super Admin Plan Configurator" : "Organization Workspace & Settings"}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Active Tier:{" "}
                <strong className="text-ink">
                  {isCore ? "🚀 Core Lead & Telecaller Suite" : "🏢 Premium Commercial ERP Suite"}
                </strong>
              </span>
              {isSuperAdmin && (
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 border border-purple-200">
                  Platform Super Admin Mode
                </span>
              )}
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              {company?.name ? `${company.name} Settings` : "Organization Settings"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              {isSuperAdmin
                ? `Configure active modules and integration credentials for ${company?.name || "this organization"}. Super Admins can override the subscription tier and toggle Marg ERP modules.`
                : `Manage your telephony call recording folder, Meta Lead Ads, WhatsApp Business API credentials, and marketing source integrations.`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-center shrink-0">
            <div className="rounded-2xl bg-slate-50 p-4 border border-line min-w-36">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Subscription Status
              </p>
              <p className="text-lg font-extrabold mt-1 text-emerald-600">
                Verified Active
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                {isCore ? "Core Lead Suite" : "Commercial ERP"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-line min-w-36">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Lead Features
              </p>
              <p className="text-lg font-extrabold text-teal-600 mt-1">
                6/6 Active
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                Standard Lead Suite
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Plan & Entitlements Section */}
      {!isSuperAdmin ? (
        /* Read-Only Plan View for Onboarded Businesses */
        <section className="rounded-3xl p-6 neo-panel bg-white border border-line space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="font-bold text-ink text-base flex items-center gap-2">
                <span>📦</span> Subscribed Plan &amp; Module Entitlements
              </h2>
              <p className="text-xs text-ink-faint mt-0.5">
                Selected during onboarding. Plan tiers and module allocations are managed by platform administration.
              </p>
            </div>
            <span className="self-start sm:self-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              ● Active Subscription
            </span>
          </div>

          {/* Active Plan Card */}
          <div
            className={`rounded-2xl p-5 border-2 ${
              isCore ? "border-teal-500 bg-teal-50/20" : "border-purple-600 bg-purple-50/20"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{isCore ? "🚀" : "🏢"}</span>
                  <div>
                    <h3 className="font-extrabold text-ink text-base">
                      {isCore ? "Core Lead & Telecaller Suite" : "Full Commercial ERP Suite"}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {isCore
                        ? "Specialized commercial lead routing engine, AI telephony call tracking, WhatsApp / Meta Ads webhooks, and telecaller team performance analytics."
                        : "Enterprise pharmaceutical commercial OS with Marg ERP 9+ connector, customer ledger, inventory batch monitoring, monopoly territory mappings, and automated reorders."}
                    </p>
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
                  isCore ? "bg-teal-100 text-teal-800" : "bg-purple-100 text-purple-800"
                }`}
              >
                Configured at Onboarding
              </span>
            </div>

            {/* Included Modules Checklist - Shows strictly active features for current plan */}
            <div className="mt-5 pt-4 border-t border-line/60">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">
                Active Modules in Your Plan ({isCore ? "7 Core Modules" : "13 Enterprise Modules"})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <PlanFeatureItem label="Unified Lead Center" active={true} detail="PCD Franchise & Third-Party inquiries" />
                <PlanFeatureItem label="Leads IQ Intelligence" active={true} detail="Turnaround & rep analytics" />
                <PlanFeatureItem label="Sources Hub & Excel" active={true} detail="Meta, IndiaMART, 5K+ upload" />
                <PlanFeatureItem label="Source-Aware Allotment" active={true} detail="Batch rep lead allocation" />
                <PlanFeatureItem label="Leads Reassignment" active={true} detail="Reassign stagnant leads" />
                <PlanFeatureItem label="Employee Tracking" active={true} detail="Login, calls & turnaround" />
                <PlanFeatureItem label="AI Calls Summary & Desk" active={true} detail="Transcripts & doctor brief reader" />
                {!isCore && settings.enableBillingErp && (
                  <PlanFeatureItem label="Marg ERP 9+ Connector" active={true} detail="15-min background invoice sync" />
                )}
                {!isCore && settings.enableClientsManagement && (
                  <PlanFeatureItem label="Clients Master Directory" active={true} detail="Synced customer ledger & GSTIN" />
                )}
                {!isCore && settings.enableTerritories && (
                  <PlanFeatureItem label="Territory Monopoly" active={true} detail="District monopoly allocations" />
                )}
                {!isCore && settings.enableStockIq && (
                  <PlanFeatureItem label="Stock IQ & Expiry Watch" active={true} detail="Formulation batch monitoring" />
                )}
                {!isCore && settings.enableReorders && (
                  <PlanFeatureItem label="Reorder Replenishment" active={true} detail="Cadence alerts & repeat sales" />
                )}
                {!isCore && settings.enableCreditManagement && (
                  <PlanFeatureItem label="Credit & Outstanding" active={true} detail="Overdue ledger & reminders" />
                )}
              </div>
            </div>
          </div>

          {/* Available Upgrades & Feature Add-ons */}
          <div className="pt-2">
            <div className="mb-4">
              <h3 className="font-extrabold text-ink text-sm flex items-center gap-2">
                <span>✨</span> Available Upgrades &amp; Feature Add-ons
              </h3>
              <p className="text-xs text-ink-faint mt-0.5">
                Expand your commercial capabilities with deep ERP sync or automated social media lead capture.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {isCore && (
                <UpgradePlanCard
                  type="ERP"
                  companyName={company?.name || "Your Company"}
                />
              )}
              <UpgradePlanCard
                type="SOCIAL"
                companyName={company?.name || "Your Company"}
              />
            </div>
          </div>

          {/* Administrative Notice */}
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-200">
            <span className="text-base text-slate-500 mt-0.5">🔒</span>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                Plan Tier Managed by Platform Administration
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Your organization&apos;s subscription plan was selected during onboarding and is locked to prevent unauthorized changes.
                To upgrade your plan, request additional module licenses, or activate the Marg ERP 9+ connector, click &quot;Upgrade Plan&quot; above or contact your Allota account manager at{" "}
                <a href="mailto:support@allota.ai" className="text-teal-600 font-bold hover:underline">
                  support@allota.ai
                </a>.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Main Configuration Form */}
      <form action={updateCompanyPlanSettings} className="space-y-6">
        {/* Super Admin Plan Switcher (Only visible to Super Admin) */}
        {isSuperAdmin && (
          <section className="rounded-3xl p-6 neo-panel bg-white border border-line space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="font-bold text-ink text-base flex items-center gap-2">
                  <span>🛡️</span> Platform Super Admin Controls: Plan &amp; Module Toggles
                </h2>
                <p className="text-xs text-ink-faint mt-0.5">
                  You are logged in as Super Admin. You can override this company&apos;s plan tier or toggle individual modules below.
                </p>
              </div>
              <span className="rounded-full bg-purple-100 text-purple-800 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                Super Admin Override
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Plan 1: Core Lead Suite */}
              <label
                className={`relative flex flex-col justify-between rounded-2xl p-5 border-2 cursor-pointer transition ${
                  isCore
                    ? "border-teal-500 bg-teal-50/20 shadow-sm ring-2 ring-teal-500/20"
                    : "border-line bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🚀</span>
                      <span className="font-bold text-ink text-sm">Core Lead &amp; Telecaller Suite</span>
                    </div>
                    <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                      High Margin · Zero ERP Overhead
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="planTier"
                    value="CORE_LEAD_SUITE"
                    defaultChecked={isCore}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500"
                  />
                </div>

                <p className="text-xs text-ink-muted mt-3 leading-relaxed">
                  Includes Lead Center (PCD &amp; Third-Party), Leads IQ, Sources &amp; 5,000+ Excel Upload,
                  Source-Aware Allotment Desk, Leads Reassign, and Employee Tracking. No Marg API fee required.
                </p>

                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-semibold text-emerald-700">
                  <span>Marg Cost: ₹0</span>
                  <span>100% Margin Saved</span>
                </div>
              </label>

              {/* Plan 2: Premium Commercial ERP Suite */}
              <label
                className={`relative flex flex-col justify-between rounded-2xl p-5 border-2 cursor-pointer transition ${
                  !isCore
                    ? "border-purple-600 bg-purple-50/20 shadow-sm ring-2 ring-purple-600/20"
                    : "border-line bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏢</span>
                      <span className="font-bold text-ink text-sm">Full Commercial ERP Suite</span>
                    </div>
                    <span className="mt-1 inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-extrabold text-purple-800">
                      With Marg ERP 9+ / Busy API
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="planTier"
                    value="PREMIUM_ERP"
                    defaultChecked={!isCore}
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                  />
                </div>

                <p className="text-xs text-ink-muted mt-3 leading-relaxed">
                  Activates everything in Core Suite PLUS Marg/Busy Accounting sync, Stock IQ &amp; Expiry Watch,
                  Reorder Cadence, Marg Credit Ledger, Clients Master, and Territory Monopoly mappings.
                </p>

                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-semibold text-purple-700">
                  <span>Enterprise Integration</span>
                  <span>Marg Fee: ₹40,000/yr</span>
                </div>
              </label>
            </div>

            {/* Modular Switches for Super Admin */}
            <div className="grid gap-6 md:grid-cols-2 pt-2">
              <div className="rounded-2xl p-4 bg-slate-50 border border-line space-y-3">
                <p className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>⚡</span> Core Lead Modules (Standard)
                </p>
                <ModuleCheckbox
                  label="Unified Lead Center"
                  detail="PCD Franchise & Third-Party commercial inquiries"
                  checked={true}
                  disabled={true}
                />
                <ModuleCheckbox
                  label="Leads IQ Intelligence"
                  detail="Conversion turnaround velocity & analytics"
                  checked={true}
                  disabled={true}
                />
                <ModuleCheckbox
                  label="Sources Hub & Excel Upload"
                  detail="Multi-channel webhooks & 5,000+ contact upload"
                  checked={true}
                  disabled={true}
                />
              </div>

              <div className="rounded-2xl p-4 bg-purple-50/40 border border-purple-200 space-y-3">
                <p className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <span>💳</span> ERP Feature Toggles
                </p>
                <ModuleToggle
                  name="enableBillingErp"
                  label="Marg ERP 9+ Connector"
                  detail="15-min background invoice sync"
                  defaultChecked={settings.enableBillingErp}
                />
                <ModuleToggle
                  name="enableClientsManagement"
                  label="Clients Directory"
                  detail="Synced customer ledger & GSTIN"
                  defaultChecked={settings.enableClientsManagement}
                />
                <ModuleToggle
                  name="enableTerritories"
                  label="Territory Monopoly"
                  detail="Distributor territory boundaries"
                  defaultChecked={settings.enableTerritories}
                />
                <ModuleToggle
                  name="enableStockIq"
                  label="Stock IQ & Expiry Watch"
                  detail="Batch stock & expiry monitoring"
                  defaultChecked={settings.enableStockIq}
                />
                <ModuleToggle
                  name="enableReorders"
                  label="Automated Reorder Replenishment"
                  detail="Reorder cadence alerts"
                  defaultChecked={settings.enableReorders}
                />
                <ModuleToggle
                  name="enableCreditManagement"
                  label="Credit & Outstanding Ledger"
                  detail="Overdue balance & reminders"
                  defaultChecked={settings.enableCreditManagement}
                />
              </div>
            </div>
          </section>
        )}

          {/* Section C: Cloud Storage & Integration APIs */}
          <section className="rounded-3xl p-6 neo-panel bg-white border border-line border-t-2 border-t-blue-500 space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>☁️</span> Cloud Storage &amp; Third-Party Integrations
                </h3>
                <p className="text-[11px] text-ink-faint">
                  Configure Google Drive for call sync and Meta/IndiaMART API credentials for automatic lead ingestion
                </p>
              </div>
              <span className="rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 text-[10px] font-extrabold">
                Live Integrations
              </span>
            </div>

            {/* Google Drive Folder */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>📁</span> Master Google Drive Folder Link (Call Recording Sync)
                </label>
                <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
                  Connected
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Central Drive folder where phone recordings land. CRM parses calls as: <code className="text-primary font-mono text-[10px]">Employee Name / YYYY-MM-DD / Recording.mp3</code>
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
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
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
              <input
                type="password"
                name="geminiApiKey"
                defaultValue={settings.geminiApiKey || ""}
                placeholder="Enter API key for AI use..."
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            {/* Meta Suite (Facebook, Instagram & WhatsApp Business API) */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <span>🌐</span> Meta Suite (Facebook Lead Ads, Instagram &amp; WhatsApp Cloud API)
                  </h4>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Meta requires separate credentials for App, Lead Ads ingestion, and WhatsApp messaging.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[10px] font-bold">
                  7 Exact Meta Columns
                </span>
              </div>

              {/* Sub-grid 1: Meta App & Token */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Meta App ID
                  </label>
                  <input
                    type="text"
                    name="metaAppId"
                    defaultValue={settings.metaAppId || ""}
                    placeholder="e.g. 184729104928172"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">From Meta App Dashboard</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Meta App Secret
                  </label>
                  <input
                    type="password"
                    name="metaAppSecret"
                    defaultValue={settings.metaAppSecret || ""}
                    placeholder="••••••••••••••••"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">App Settings &gt; Basic</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    System User Access Token
                  </label>
                  <input
                    type="password"
                    name="metaAccessToken"
                    defaultValue={settings.metaAccessToken || settings.metaApiKey || ""}
                    placeholder="EAAG... (Never Expiring)"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">Meta Business Suite System User</p>
                </div>
              </div>

              {/* Sub-grid 2: Facebook Page & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-indigo-100">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Facebook Page ID
                  </label>
                  <input
                    type="text"
                    name="metaPageId"
                    defaultValue={settings.metaPageId || ""}
                    placeholder="e.g. 109283746501928"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">Lead Ads source page</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Meta Ad Account ID (Optional)
                  </label>
                  <input
                    type="text"
                    name="metaAdAccountId"
                    defaultValue={settings.metaAdAccountId || ""}
                    placeholder="act_1234567890"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">From Ads Manager</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    WhatsApp WABA ID
                  </label>
                  <input
                    type="text"
                    name="metaWabaId"
                    defaultValue={settings.metaWabaId || ""}
                    placeholder="e.g. 209384756102938"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">WhatsApp Business Account ID</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    WhatsApp Phone Number ID
                  </label>
                  <input
                    type="text"
                    name="metaPhoneNumberId"
                    defaultValue={settings.metaPhoneNumberId || ""}
                    placeholder="e.g. 105928374619283"
                    className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">API Setup Phone Number ID</p>
                </div>
              </div>
            </div>

            {/* Other APIs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-line bg-slate-50 p-3 space-y-1.5">
                <label className="block text-xs font-bold text-ink">
                  IndiaMART CRM Key
                </label>
                <input
                  type="text"
                  name="indiaMartApiKey"
                  defaultValue={settings.indiaMartApiKey || ""}
                  placeholder="mKey_9x8a7b6c5d4e3f..."
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
              </div>
              <div className="rounded-2xl border border-line bg-slate-50 p-3 space-y-1.5">
                <label className="block text-xs font-bold text-ink">
                  Marg ERP / Billing Software Key
                </label>
                <input
                  type="text"
                  name="billingSoftwareApiKey"
                  defaultValue={settings.billingSoftwareApiKey || ""}
                  placeholder="Marg ERP 9+ Token"
                  className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint font-mono"
                />
              </div>
            </div>
        </section>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/25 hover:from-teal-700 hover:to-emerald-700 transition cursor-pointer"
          >
            <span>💾</span>
            <span>{isSuperAdmin ? "Save Plan & Integration Settings" : "Save Integration Settings"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function PlanFeatureItem({
  label,
  active,
  detail,
}: {
  label: string;
  active: boolean;
  detail: string;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl p-3 border transition ${
        active
          ? "bg-white border-emerald-200/80 shadow-xs"
          : "bg-slate-50/60 border-slate-200/60 opacity-60"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
        }`}
      >
        {active ? "✓" : "–"}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-xs font-bold truncate ${active ? "text-ink" : "text-ink-muted line-through"}`}>
            {label}
          </p>
          {active ? (
            <span className="rounded bg-emerald-50 px-1.5 py-0.2 text-[9px] font-extrabold text-emerald-700">
              Active
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-500">
              Locked
            </span>
          )}
        </div>
        <p className="text-[10px] text-ink-faint truncate mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function ModuleCheckbox({
  label,
  detail,
  checked,
  disabled,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl p-3 bg-slate-50 border border-line">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded text-teal-600 focus:ring-teal-500 opacity-80"
      />
      <div>
        <p className="text-xs font-bold text-ink">{label}</p>
        <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function ModuleToggle({
  name,
  label,
  detail,
  defaultChecked,
}: {
  name: string;
  label: string;
  detail: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl p-3 bg-white hover:bg-slate-50 border border-line cursor-pointer transition">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
      />
      <div>
        <p className="text-xs font-bold text-ink">{label}</p>
        <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">{detail}</p>
      </div>
    </label>
  );
}
