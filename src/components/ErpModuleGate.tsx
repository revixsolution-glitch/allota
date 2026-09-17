import Link from "next/link";

interface ErpModuleGateProps {
  moduleName: string;
  description: string;
  erpDependency: string;
  icon?: string;
}

export function ErpModuleGate({
  moduleName,
  description,
  erpDependency,
  icon = "🔒",
}: ErpModuleGateProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-3xl p-8 neo-panel bg-white border-t-4 border-t-amber-500 shadow-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl border border-amber-200">
          {icon}
        </div>

        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
          Premium Billing ERP Add-On Module
        </span>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">
          {moduleName} is Inactive
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {description}
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-line text-left">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <span>💡</span> Commercial Reason:
          </p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            This module requires direct synchronization with {erpDependency}. In accordance with your selected plan, this module is toggled off to avoid the <strong>₹40,000 yearly API fee</strong>.
          </p>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/admin/settings"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-teal-500/20 hover:from-teal-700 hover:to-emerald-700 transition"
          >
            <span>⚙️</span>
            <span>Configure Plan & Module Toggles</span>
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
