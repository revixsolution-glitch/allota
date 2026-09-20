import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { updateCompanyPlanSettings } from "@/lib/admin-actions";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";

export default async function AdminSettingsPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

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

  const isCore = settings.planTier === "CORE_LEAD_SUITE" || (!settings.enableBillingErp && !settings.enableStockIq && !settings.enableClientsManagement);

  return (
    <div className="space-y-7 max-w-6xl mx-auto">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary/60 bg-white">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                Client Onboarding & Plan Configurator
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Active Tier:{" "}
                <strong className="text-ink">
                  {isCore ? "🚀 Core Lead & Telecaller Suite" : "🏢 Premium Commercial ERP Suite"}
                </strong>
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              {company?.name ? `${company.name} Plan & Modules` : "Company Plan & Module Toggles"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Configure which modules are active for {company?.name ? <strong className="text-ink">{company.name}</strong> : "this company"}. To avoid paying Marg ERP’s{" "}
              <strong>₹40,000 yearly API connector fee</strong>, onboard standard clients with the Core Lead Suite. 
              Billing modules can be activated individually whenever a client chooses to pay for Marg API integration.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-center shrink-0">
            <div className="rounded-2xl bg-slate-50 p-4 border border-line min-w-36">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Marg ERP API Fee
              </p>
              <p className={`text-xl font-extrabold mt-1 ${isCore ? "text-emerald-600" : "text-amber-600"}`}>
                {isCore ? "₹0 / year" : "₹40,000 / year"}
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                {isCore ? "100% Margin Saved" : "Client Paid License"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-line min-w-36">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Lead Features
              </p>
              <p className="text-xl font-extrabold text-teal-600 mt-1">
                Always Active
              </p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                All 6 Lead Modules
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Configuration Form */}
      <form action={updateCompanyPlanSettings} className="space-y-6">
        {/* Tier Preset Cards */}
        <section className="rounded-3xl p-6 neo-panel bg-white border border-line">
          <h2 className="font-bold text-ink text-base flex items-center gap-2">
            <span>📦</span> Select Preset Plan Package
          </h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Choose a quick package preset, or fine-tune individual module switches below.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* Plan 1: Core Lead Suite */}
            <label className={`relative flex flex-col justify-between rounded-2xl p-5 border-2 cursor-pointer transition ${
              isCore
                ? "border-teal-500 bg-teal-50/20 shadow-sm ring-2 ring-teal-500/20"
                : "border-line bg-white hover:border-slate-300"
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚀</span>
                    <span className="font-bold text-ink text-sm">Core Lead & Telecaller Suite</span>
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
                Includes Lead Center (PCD & Third-Party), Leads IQ, Sources & 5,000+ Excel Upload, 
                Source-Aware Allotment Desk, Leads Reassign, and Employee Tracking. <strong>No Marg API fee required.</strong>
              </p>

              <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span>Estimated Margin: ~100%</span>
                <span>Marg Cost: ₹0</span>
              </div>
            </label>

            {/* Plan 2: Premium Commercial ERP Suite */}
            <label className={`relative flex flex-col justify-between rounded-2xl p-5 border-2 cursor-pointer transition ${
              !isCore
                ? "border-purple-600 bg-purple-50/20 shadow-sm ring-2 ring-purple-600/20"
                : "border-line bg-white hover:border-slate-300"
            }`}>
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
                Activates everything in Core Suite PLUS Marg/Busy Accounting sync, Stock IQ & Expiry Watch, 
                Reorder Cadence, Marg Credit Ledger, Clients Master, and Territory Monopoly mappings.
              </p>

              <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-semibold text-purple-700">
                <span>Enterprise Integration</span>
                <span>Marg Fee: ₹40,000/yr</span>
              </div>
            </label>
          </div>
        </section>

        {/* Modular Switches */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Section A: Core Lead Engine (Included) */}
          <div className="rounded-3xl p-6 neo-panel bg-white border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>⚡</span> Core Lead Management Modules
                </h3>
                <p className="text-[11px] text-ink-faint">Standard features included with all plans</p>
              </div>
              <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-extrabold">
                Always Active
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <ModuleCheckbox
                label="Unified Lead Center"
                detail="PCD Franchise & Third-Party commercial inquiries with zero blank space"
                checked={true}
                disabled={true}
              />
              <ModuleCheckbox
                label="Leads IQ Intelligence"
                detail="Pure lead analytics, source conversion rates, velocity & rep response turnaround"
                checked={true}
                disabled={true}
              />
              <ModuleCheckbox
                label="Multi-Channel Sources & Bulk Excel Upload"
                detail="Meta Ads, IndiaMART, WhatsApp API webhooks + drag-and-drop 5,000+ contact importer"
                checked={true}
                disabled={true}
              />
              <ModuleCheckbox
                label="Dynamic Source-Aware Leads Allotment"
                detail="Batch allot by source, quantity (e.g. 50), division, and employee with transaction logs"
                checked={true}
                disabled={true}
              />
              <ModuleCheckbox
                label="Leads Reassignment Engine"
                detail="Test & reassign stagnant leads from underperforming reps to top performers"
                checked={true}
                disabled={true}
              />
              <ModuleCheckbox
                label="Employee Directory & Field Activity"
                detail="Login/logout, working hours, daily call durations, converted vs dead lead ratio"
                checked={true}
                disabled={true}
              />
            </div>
          </div>

          {/* Section B: Billing ERP Modules (Optional) */}
          <div className="rounded-3xl p-6 neo-panel bg-white border border-line border-t-2 border-t-purple-500">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>💳</span> Billing ERP & Marg Modules (Optional)
                </h3>
                <p className="text-[11px] text-ink-faint">Toggle ON only if client agrees to pay Marg API fee</p>
              </div>
              <span className="rounded-full bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 text-[10px] font-extrabold">
                Requires ERP API
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <ModuleToggle
                name="enableBillingErp"
                label="Marg ERP 9+ / Busy API Connector"
                detail="Enables automated 15-minute background billing sync and invoice parsing"
                defaultChecked={settings.enableBillingErp}
              />
              <ModuleToggle
                name="enableClientsManagement"
                label="Clients Directory"
                detail="Synced Marg customer master ledger, GSTIN verification, and repeat buyer tags"
                defaultChecked={settings.enableClientsManagement}
              />
              <ModuleToggle
                name="enableTerritories"
                label="Territories & Monopoly Allotments"
                detail="State and district monopoly distributor boundaries sourced from billing territories"
                defaultChecked={settings.enableTerritories}
              />
              <ModuleToggle
                name="enableStockIq"
                label="Stock IQ & Batch Inventory"
                detail="Formulation catalog (tablets, softgels, injectables), box stock & expiry risk buckets"
                defaultChecked={settings.enableStockIq}
              />
              <ModuleToggle
                name="enableReorders"
                label="Automated Reorder Replenishment"
                detail="Calculated reorder cadence alerts (>30 days) and purchase order generation"
                defaultChecked={settings.enableReorders}
              />
              <ModuleToggle
                name="enableCreditManagement"
                label="Credit & Outstanding Ledger"
                detail="Overdue balance tracking, payment promise dates, and automated payment reminders"
                defaultChecked={settings.enableCreditManagement}
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
            <span>Save & Apply Plan Configuration</span>
          </button>
        </div>
      </form>
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
