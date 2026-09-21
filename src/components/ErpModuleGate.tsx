import Link from "next/link";

interface ErpModuleGateProps {
  moduleName: string;
  description?: string;
  erpDependency?: string;
  icon?: string;
}

export function ErpModuleGate({
  moduleName,
  description,
  erpDependency = "Marg ERP 9+ or Billing API",
  icon = "🔒",
}: ErpModuleGateProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-3xl p-8 neo-panel bg-white border-t-4 border-t-amber-500 shadow-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl border border-amber-200">
          {icon}
        </div>

        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
          🔒 API Not Connected
        </span>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">
          API Not Connected
        </h1>

        <div className="mt-3 inline-block rounded-xl bg-rose-50 border border-rose-200 px-4 py-2">
          <p className="text-xs font-bold text-rose-700">
            {erpDependency} is needed to access this feature
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          {description ||
            `This module requires an active connection to your pharmaceutical billing software to synchronize distributor ledger accounts, inventory batch balances, and invoices.`}
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-line text-left">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <span>💡</span> Requirement:
          </p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            To activate <strong>{moduleName}</strong>, please connect your Marg ERP 9+ / Busy API credentials in Company Settings, or upgrade to the Full Commercial ERP Suite.
          </p>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/admin/settings"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-teal-500/20 hover:from-teal-700 hover:to-emerald-700 transition"
          >
            <span>⚙️</span>
            <span>Configure Billing API in Settings</span>
          </Link>
          <Link
            href="/admin/leads"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-xs font-bold text-ink-muted neo-button hover:text-primary transition"
          >
            <span>⚡ Go to Lead Center</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
