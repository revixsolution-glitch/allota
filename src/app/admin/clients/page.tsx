import Link from "next/link";
import { ClientStatus } from "@/generated/prisma/enums";
import { createClient, updateClientAssignment } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ErpModuleGate } from "@/components/ErpModuleGate";

import { parseDashboardDateFilter } from "@/lib/date-filters";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const params = searchParams ? await searchParams : {};
  const dateFilter = parseDashboardDateFilter(
    params.range,
    params.from,
    params.to
  );

  const clientDateFilter =
    dateFilter.start && dateFilter.end
      ? { createdAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { createdAt: { gte: dateFilter.start } }
      : {};

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

  if (!canAccessErp || !settings?.enableClientsManagement) {
    return (
      <ErpModuleGate
        moduleName="Franchise Clients Master"
        description="Tracks verified PCD franchise partner accounts, GSTIN registrations, and billing credit balances."
        erpDependency="Marg ERP 9+ or Billing API"
        icon="🏢"
      />
    );
  }

  const [clients, territories, employees] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...companyScope,
        ...clientDateFilter,
      },
      include: {
        territory: true,
        assignedEmployee: true,
        orders: {
          orderBy: { orderDate: "desc" },
          take: 1,
        },
        creditRecords: {
          orderBy: { dueDate: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.territory.findMany({
      where: companyScope,
      orderBy: [{ state: "asc" }, { city: "asc" }],
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: { user: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();
  const totalCreditBook = clients.reduce(
    (sum, c) =>
      sum +
      c.creditRecords.reduce((s, cr) => s + Number(cr.balanceAmount), 0),
    0
  );

  return (
    <div className="space-y-7">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-indigo-500/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                Authorized Franchisees
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
              Franchise Client Directory
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl px-4 py-3 neo-pressed border border-line text-center">
              <p className="text-xl font-extrabold text-indigo-600">{clients.length}</p>
              <p className="text-xs font-semibold text-ink-faint">Total Parties</p>
            </div>
            <div className="rounded-2xl px-4 py-3 neo-pressed border border-line text-center">
              <p className="text-xl font-extrabold text-emerald-600">
                {clients.filter(c => c.isRepeatCustomer).length}
              </p>
              <p className="text-xs font-semibold text-ink-faint">Repeat Buyers</p>
            </div>
            <div className="rounded-2xl px-4 py-3 neo-pressed border border-line text-center">
              <p className="text-xl font-extrabold text-amber-600">
                ₹{(totalCreditBook / 100000).toFixed(1)}L
              </p>
              <p className="text-xs font-semibold text-ink-faint">Active Credit</p>
            </div>
          </div>
        </div>
      </section>

      {/* Add Client Form */}
      <section className="rounded-3xl p-6 neo-panel">
        <h2 className="font-bold text-ink text-base">Register Franchise Partner</h2>

        <form
          action={createClient}
          className="mt-5 grid gap-4 lg:grid-cols-3"
        >
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Client / Company Name
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Apex Health Remedies Pvt Ltd"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Phone Number
            </label>
            <input
              name="phoneNumber"
              placeholder="+91 98765 43210"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Territory Allotment
            </label>
            <select
              name="territoryId"
              className={formInputClass}
              defaultValue=""
            >
              <option value="">Select territory...</option>
              {territories.map((territory) => (
                <option key={territory.id} value={territory.id}>
                  {territory.city}, {territory.state}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Field Executive / Owner
            </label>
            <select
              name="assignedEmployeeId"
              className={formInputClass}
              defaultValue=""
            >
              <option value="">Assign representative...</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Status
            </label>
            <select
              name="status"
              className={formInputClass}
              defaultValue={ClientStatus.ACTIVE}
            >
              <option value={ClientStatus.ACTIVE}>Active Partner</option>
              <option value={ClientStatus.INACTIVE}>Inactive / Dormant</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              GST / Drug License Details
            </label>
            <input
              name="companyDetails"
              placeholder="GSTIN, DL No., address..."
              className={formInputClass}
            />
          </div>

          <div className="flex items-center gap-3 lg:col-span-2 pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                name="isRepeatCustomer"
                type="checkbox"
                className="h-4 w-4 rounded-md border-line text-primary focus:ring-primary/40"
              />
              Mark as Monthly Repeat Customer (Cadence Tracking)
            </label>
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-gradient-to-r from-primary to-primary-strong px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 hover:shadow-lg transition-all"
          >
            Add Client Partner
          </button>
        </form>
      </section>

      {/* Directory Table */}
      <div className="overflow-hidden rounded-3xl neo-panel">
        <div className="border-b border-line px-6 py-4 flex items-center justify-between bg-slate-50/40">
          <div>
            <h2 className="font-bold text-ink text-base">Active Franchise Partners</h2>
          </div>
          <span className="text-xs font-bold text-ink-faint bg-white border border-line rounded-full px-3 py-1 shadow-sm">
            {clients.length} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-6 py-3.5">Company Name</th>
                <th className="px-6 py-3.5">Territory</th>
                <th className="px-6 py-3.5">Sales Owner</th>
                <th className="px-6 py-3.5">Credit Standing</th>
                <th className="px-6 py-3.5">Repeat Order</th>
                <th className="px-6 py-3.5">Last Order Date</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <p className="font-bold text-ink">{client.name}</p>
                    <p className="text-xs text-ink-faint mt-0.5 font-medium">
                      {client.phoneNumber ?? "No contact number"}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    {client.territory ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-800">
                        <svg className="h-3 w-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {client.territory.city}, {client.territory.state}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <form action={updateClientAssignment} className="flex items-center gap-2">
                      <input type="hidden" name="clientId" value={client.id} />
                      <select
                        name="assignedEmployeeId"
                        defaultValue={client.assignedEmployeeId ?? ""}
                        className="rounded-xl border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
                      >
                        <option value="">Unassigned</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-xl px-2.5 py-1 text-xs font-bold text-ink-muted neo-button hover:text-primary hover:border-primary/40"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="px-6 py-4">
                    {client.creditRecords.length > 0 && client.creditRecords.some(cr => Number(cr.balanceAmount) > 0) ? (
                      (() => {
                        const activeCr = client.creditRecords.find(cr => Number(cr.balanceAmount) > 0) || client.creditRecords[0];
                        const diffDays = Math.ceil((activeCr.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        const isOverdue = diffDays < 0;
                        const isNearby = diffDays >= 0 && diffDays <= 3;
                        const balance = Number(activeCr.balanceAmount);

                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-xs text-ink">
                                ₹{balance.toLocaleString("en-IN")}
                              </span>
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                                isOverdue
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : isNearby
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}>
                                {activeCr.daysAsked}d credit ({isOverdue ? `${Math.abs(diffDays)}d overdue` : `${diffDays}d left`})
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {activeCr.sendAiMessage && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  AI Alert
                                </span>
                              )}
                              {activeCr.enableAiCall && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                  AI Call
                                </span>
                              )}
                              <Link
                                href="/admin/credits"
                                className="text-[10px] font-bold text-primary hover:underline"
                              >
                                View →
                              </Link>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="inline-block rounded-md bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 text-xs font-semibold">
                        Clean / Zero Credit
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold border ${
                      client.isRepeatCustomer
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {client.isRepeatCustomer ? "Monthly Repeat" : "Standard"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-ink-muted">
                    {client.orders[0]
                      ? client.orders[0].orderDate.toLocaleDateString("en-IN")
                      : <span className="text-ink-faint">No orders logged</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-md px-2.5 py-0.5 text-xs font-bold border ${
                      client.status === ClientStatus.ACTIVE
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}>
                      {client.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!clients.length && (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-ink-faint" colSpan={7}>
                    No client partners registered yet.
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
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-primary/40 transition";

