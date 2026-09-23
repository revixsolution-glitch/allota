import { createTerritory } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ErpModuleGate } from "@/components/ErpModuleGate";

export default async function AdminTerritoriesPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
      })
    : await prisma.companySettings.findFirst({
        where: { id: "default" },
      });

  const isSuperAdmin = session?.role === "SUPER_ADMIN";
  const company = activeCompanyId
    ? await prisma.company.findUnique({ where: { id: activeCompanyId } })
    : null;
  const isDemoAdmin =
    isSuperAdmin ||
    !company?.slug ||
    company.slug === "pharma-life" ||
    company.slug === "pharma-life-sciences";

  const hasBillingApi = Boolean(settings?.billingSoftwareApiKey && settings?.enableBillingErp);
  const canAccessErp = hasBillingApi || (isDemoAdmin && Boolean(settings?.enableBillingErp));

  if (!canAccessErp || !settings?.enableTerritories) {
    return (
      <ErpModuleGate
        moduleName="Territory & Monopoly Distribution"
        description="Defines exclusive state and district/city boundaries to prevent franchise territory overlap across billing accounts."
        erpDependency="Marg ERP 9+ or Billing API"
        icon="🗺️"
      />
    );
  }

  const territories = await prisma.territory.findMany({
    where: companyScope,
    include: {
      _count: {
        select: { clients: true },
      },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }],
  });

  return (
    <div className="space-y-7">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-teal-500/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                Monopoly & Regional Rights
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
              Territory Distribution
            </h1>
          </div>

          <div className="rounded-2xl px-5 py-3 neo-pressed border border-line text-center shrink-0">
            <p className="text-2xl font-extrabold text-teal-600">{territories.length}</p>
            <p className="text-xs font-semibold text-ink-faint">Allotted Markets</p>
          </div>
        </div>
      </section>

      {/* Add Territory Form */}
      <section className="rounded-3xl p-6 neo-panel">
        <h2 className="font-bold text-ink text-base">Allot New Territory</h2>

        <form
          action={createTerritory}
          className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              State / Province
            </label>
            <input
              name="state"
              required
              placeholder="e.g. Maharashtra, Punjab, Gujarat"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              City / Headquarters District
            </label>
            <input
              name="city"
              required
              placeholder="e.g. Pune, Ludhiana, Ahmedabad"
              className={formInputClass}
            />
          </div>

          <button
            type="submit"
            className="self-end rounded-2xl bg-gradient-to-r from-teal-500 to-teal-700 px-6 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg transition-all"
          >
            Add Territory
          </button>
        </form>
      </section>

      {/* Territories Table */}
      <div className="overflow-hidden rounded-3xl neo-panel">
        <div className="border-b border-line px-6 py-4 flex items-center justify-between bg-slate-50/40">
          <div>
            <h2 className="font-bold text-ink text-base">Active Territory Allotments</h2>
          </div>
          <span className="text-xs font-bold text-ink-faint bg-white border border-line rounded-full px-3 py-1 shadow-sm">
            {territories.length} territories
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-6 py-3.5">State</th>
                <th className="px-6 py-3.5">City / District</th>
                <th className="px-6 py-3.5">Client Accounts</th>
                <th className="px-6 py-3.5">Created Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {territories.map((territory) => (
                <tr key={territory.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4 font-bold text-ink">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs text-teal-900">
                      {territory.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-ink-muted">
                    {territory.city}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-md px-2.5 py-0.5 text-xs font-bold border ${
                      territory._count.clients > 0
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {territory._count.clients} {territory._count.clients === 1 ? "Client" : "Clients"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-ink-faint">
                    {territory.createdAt.toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
              {!territories.length && (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-ink-faint" colSpan={4}>
                    No territories registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const formInputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition";

