import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { parseDashboardDateFilter } from "@/lib/date-filters";

interface AdminDashboardPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AdminDashboardPage(props: AdminDashboardPageProps) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const searchParams = props.searchParams ? await props.searchParams : {};

  const dateFilter = parseDashboardDateFilter(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const now = new Date();
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  // Build Prisma date filters
  const callDateFilter = dateFilter.start && dateFilter.end
    ? { occurredAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { occurredAt: { gte: dateFilter.start } }
    : {};

  const leadDateFilter = dateFilter.start && dateFilter.end
    ? { createdAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { createdAt: { gte: dateFilter.start } }
    : {};

  const orderDateFilter = dateFilter.start && dateFilter.end
    ? { orderDate: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { orderDate: { gte: dateFilter.start } }
    : {};

  const callCompanyFilter = activeCompanyId
    ? {
        OR: [
          { employee: { companyId: activeCompanyId } },
          { lead: { companyId: activeCompanyId } },
          { client: { companyId: activeCompanyId } },
        ],
      }
    : {};

  const [
    territoryCount,
    clientCount,
    activeClientCount,
    repeatClientCount,
    employeeCount,
    periodLeadCount,
    newLeadCount,
    assignedLeadCount,
    convertedLeadCount,
    periodSales,
    callsInPeriod,
    missedCallsInPeriod,
    pendingPoCount,
    recentLeads,
    topEmployees,
    territoryCoverage,
    repeatClients,
    lowStockProducts,
    activeCredits,
    nearExpiryCount,
  ] = await Promise.all([
    prisma.territory.count({ where: companyScope }),
    prisma.client.count({ where: companyScope }),
    prisma.client.count({ where: { ...companyScope, status: "ACTIVE" } }),
    prisma.client.count({ where: { ...companyScope, isRepeatCustomer: true } }),
    prisma.employee.count({ where: companyScope }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter } }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter, status: "NEW" } }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter, status: "ASSIGNED" } }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter, status: "CONVERTED" } }),
    prisma.order.aggregate({
      _sum: { amount: true },
      _count: { id: true },
      where: { ...companyScope, ...orderDateFilter },
    }),
    prisma.call.count({
      where: {
        ...callDateFilter,
        ...callCompanyFilter,
      },
    }),
    prisma.call.count({
      where: {
        ...callDateFilter,
        missed: true,
        ...callCompanyFilter,
      },
    }),
    prisma.purchaseOrderAlert.count({
      where: {
        status: "PENDING",
        ...(activeCompanyId ? { product: { companyId: activeCompanyId } } : {}),
      },
    }),
    prisma.lead.findMany({
      where: { ...companyScope, ...leadDateFilter },
      include: { assignedEmployee: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: {
        _count: {
          select: {
            clients: true,
            leads: { where: leadDateFilter },
            calls: { where: callDateFilter },
          },
        },
      },
      orderBy: { leads: { _count: "desc" } },
      take: 4,
    }),
    prisma.territory.findMany({
      where: companyScope,
      include: { _count: { select: { clients: true } } },
      orderBy: [{ state: "asc" }, { city: "asc" }],
      take: 6,
    }),
    prisma.client.findMany({
      where: { ...companyScope, isRepeatCustomer: true },
      include: {
        assignedEmployee: true,
        territory: true,
        orders: {
          orderBy: { orderDate: "desc" },
          take: 1,
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.product.findMany({
      where: companyScope,
      orderBy: [{ stockQty: "asc" }, { name: "asc" }],
      take: 5,
    }),
    prisma.creditRecord.findMany({
      where: {
        status: { not: "SETTLED" },
        ...(activeCompanyId ? { client: { companyId: activeCompanyId } } : {}),
      },
      include: { client: true },
    }),
    prisma.product.count({
      where: {
        ...companyScope,
        expiryDate: {
          lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          gt: now,
        },
      },
    }),
  ]);

  const totalCreditOutstanding = activeCredits.reduce(
    (sum, c) => sum + Number(c.balanceAmount),
    0
  );
  const overdueCreditsCount = activeCredits.filter(
    (c) => c.status === "OVERDUE" || c.dueDate < now
  ).length;
  const nearbyCreditsCount = activeCredits.filter((c) => {
    const diff = Math.ceil(
      (c.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff >= 0 && diff <= 3;
  }).length;
  const atRiskCreditAmount = activeCredits
    .filter(
      (c) =>
        c.status === "OVERDUE" ||
        c.dueDate < now ||
        (c.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 3
    )
    .reduce((sum, c) => sum + Number(c.balanceAmount), 0);

  const lowStockCount = lowStockProducts.filter(
    (product) => product.stockQty <= product.reorderThreshold
  ).length;

  const dueNowReordersCount = repeatClients.filter((c) => {
    const lastOrder = c.orders[0];
    if (!lastOrder) return false;
    const daysAgo = Math.floor((now.getTime() - lastOrder.orderDate.getTime()) / 86400000);
    const cadence = c.avgReorderIntervalDays || 30;
    const diff = cadence - daysAgo;
    return diff <= 3 && diff >= -4;
  }).length;

  const overdueReordersCount = repeatClients.filter((c) => {
    const lastOrder = c.orders[0];
    if (!lastOrder) return false;
    const daysAgo = Math.floor((now.getTime() - lastOrder.orderDate.getTime()) / 86400000);
    const cadence = c.avgReorderIntervalDays || 30;
    return daysAgo > cadence + 4;
  }).length;

  const periodRevenue = Number(periodSales._sum.amount ?? 0);
  const periodOrderCount = periodSales._count.id ?? 0;
  const connectedCallsInPeriod = Math.max(0, callsInPeriod - missedCallsInPeriod);
  const missedCallRate =
    callsInPeriod > 0 ? Math.round((missedCallsInPeriod / callsInPeriod) * 100) : 0;
  const pipelineCount = periodLeadCount > 0 ? periodLeadCount : newLeadCount + assignedLeadCount;

  const stats = [
    {
      label: dateFilter.preset === "all_time" ? "Total Revenue" : `Sales (${dateFilter.label})`,
      value: formatCurrency(periodRevenue),
      detail:
        periodOrderCount > 0
          ? `${periodOrderCount} orders booked in ${dateFilter.label}`
          : `No orders in ${dateFilter.label}`,
      accent: "emerald" as const,
      icon: (
        <span className="text-base font-bold">₹</span>
      ),
      iconBg: "from-emerald-500 to-teal-600 text-white shadow-emerald-500/20",
      topBar: "from-emerald-400 via-teal-500 to-emerald-600",
      pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      label: dateFilter.preset === "all_time" ? "Total Inquiries" : `Leads (${dateFilter.label})`,
      value: periodLeadCount.toString(),
      detail: `${newLeadCount} new / ${convertedLeadCount} converted`,
      accent: "indigo" as const,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      iconBg: "from-blue-500 to-indigo-600 text-white shadow-blue-500/20",
      topBar: "from-blue-400 via-indigo-500 to-blue-600",
      pillClass: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      label: "Total Parties",
      value: clientCount.toString(),
      detail: `${repeatClientCount} repeat customers tracked`,
      accent: "teal" as const,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      iconBg: "from-teal-500 to-cyan-600 text-white shadow-teal-500/20",
      topBar: "from-teal-400 via-cyan-500 to-teal-600",
      pillClass: "bg-teal-50 text-teal-700 border-teal-200",
    },
    {
      label: `Telephony Calls (${dateFilter.label})`,
      value: `${callsInPeriod}`,
      detail: `${connectedCallsInPeriod} picked · ${missedCallsInPeriod} missed (${missedCallRate}%)`,
      accent: "rose" as const,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
        </svg>
      ),
      iconBg: "from-rose-500 to-red-600 text-white shadow-rose-500/20",
      topBar: "from-rose-400 via-red-500 to-rose-600",
      pillClass: "bg-rose-50 text-rose-700 border-rose-200",
    },
  ];

  // Set to true to restore System Operations & Health module on the dashboard in future
  const SHOW_SYSTEM_OPERATIONS = false;

  const operationalModules = [
    { label: "Franchise & Party Accounts", metric: `${clientCount} Verified Partners`, live: clientCount > 0 },
    { label: "Territory Monopoly Boundaries", metric: `${territoryCount} Allotted Markets`, live: territoryCount > 0 },
    { label: "Unified Lead Pipeline", metric: `${pipelineCount} Active Inquiries`, live: pipelineCount > 0 },
    { label: "Stock IQ Warehouse Catalog", metric: `${lowStockProducts.length > 0 ? "Active Inventory Sync" : "No SKU Synced"}`, live: lowStockProducts.length > 0 },
    { label: "Field Representative Roster", metric: `${employeeCount} Active Reps`, live: employeeCount > 0 },
    { label: "Credit Ledger Accounts", metric: `${activeCredits.length} Active Records`, live: activeCredits.length > 0 },
  ];

  return (
    <div className="space-y-7">
      {/* Top Header Row with Title & Active Period */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
              Allota AI CRM
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-200">
              Allota AI Live
            </span>
          </div>
          <p className="text-xs text-ink-faint mt-0.5">
            Active Filter: <strong className="text-primary font-bold">{dateFilter.label}</strong> (Use top-right Date Filter to adjust)
          </p>
        </div>
      </div>

      {/* 4 Colored Neumorphic Stat Cards */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-3xl neo-panel-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className={`h-1.5 w-full bg-gradient-to-r ${stat.topBar}`} />
            <div className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                  {stat.label}
                </p>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.iconBg} shadow-sm`}>
                  {stat.icon}
                </div>
              </div>

              <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
                {stat.value}
              </p>

              <div className="mt-3">
                <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold border ${stat.pillClass}`}>
                  {stat.detail}
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* AI Priority Desk & Build Roadmap */}
      <div className={SHOW_SYSTEM_OPERATIONS ? "grid gap-6 xl:grid-cols-[1.15fr_0.85fr]" : "w-full"}>
        <section className="rounded-3xl neo-panel overflow-hidden">
          <PanelHeader
            title="AI Priority Desk"
            description="High-leverage action queue prioritized by revenue risk."
            badge="Automated"
          />
          <div className="divide-y divide-line-soft">
            <PriorityRow
              label="Credit Recovery & AI Alerts"
              value={`${overdueCreditsCount + nearbyCreditsCount} accounts`}
              detail={`${overdueCreditsCount} overdue, ${nearbyCreditsCount} due in ≤3d (${formatCurrency(atRiskCreditAmount)} total at risk). Manage automated AI dispatch in Credit Management.`}
              tone={overdueCreditsCount > 0 ? "rose" : "amber"}
            />
            <PriorityRow
              label="Repeat Order Cadence & Reorders"
              value={`${dueNowReordersCount} Due · ${overdueReordersCount} At-Risk`}
              detail={`${dueNowReordersCount} franchise accounts due for reorder, ${overdueReordersCount} delayed past reorder cadence. Sourced from Marg ERP & Busy.`}
              tone={overdueReordersCount > 0 ? "rose" : "amber"}
            />
            <PriorityRow
              label="Missed-Call Recovery"
              value={`${missedCallsInPeriod} missed`}
              detail={`Immediate WhatsApp recovery queue for calls missed in ${dateFilter.label}.`}
              tone="rose"
            />
            <PriorityRow
              label="Stock & Expiry Alerts"
              value={`${lowStockCount} Low · ${nearExpiryCount} Near Expiry`}
              detail={`${lowStockCount} SKUs below threshold, ${nearExpiryCount} batches expiring within 90 days. Click Stock IQ to inspect box counts.`}
              tone={nearExpiryCount > 0 ? "amber" : "blue"}
            />
            <PriorityRow
              label="Pipeline Conversions"
              value={`${convertedLeadCount} won`}
              detail={`Franchise leads converted in ${dateFilter.label}.`}
              tone="emerald"
            />
          </div>
        </section>

        {/* System Operations & Health (Hidden by default; set SHOW_SYSTEM_OPERATIONS = true to re-enable) */}
        {SHOW_SYSTEM_OPERATIONS && (
          <section className="rounded-3xl neo-panel overflow-hidden">
            <PanelHeader
              title="System Operations & Health"
              description="Live status of connected CRM modules and database entities."
              badge="Live Telemetry"
            />
            <div className="space-y-3 p-6">
              {operationalModules.map((item, idx) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl p-3 neo-pressed transition"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      item.live ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                    }`}>
                      {item.live ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        item.live ? "font-semibold text-ink" : "text-ink-muted"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                      item.live
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {item.metric}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 3 Analytics Columns with Rich Badges */}
      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardPanel
          title={`Recent Leads (${dateFilter.label})`}
          description={`Demand signals captured in ${dateFilter.label}`}
        >
          {recentLeads.map((lead) => (
            <div key={lead.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50 transition">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink text-sm">{lead.name ?? "Unnamed inquiry"}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold border ${getPlatformTagClass(lead.source)}`}>
                    {lead.source}
                  </span>
                  <span className="text-xs text-ink-faint truncate">
                    {lead.assignedEmployee?.name ?? "Unassigned"}
                  </span>
                </div>
              </div>
              <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold border ${getStatusTagClass(lead.status)}`}>
                {lead.status}
              </span>
            </div>
          ))}
          {!recentLeads.length && (
            <EmptyState label={`No leads captured for ${dateFilter.label}.`} />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Top Employees"
          description={`Ownership & calls activity in ${dateFilter.label}`}
        >
          {topEmployees.map((employee) => (
            <div key={employee.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50 transition">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white font-bold text-xs shadow-sm">
                  {employee.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink text-sm">{employee.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-faint">
                    {employee._count.clients} clients • {employee._count.calls} calls in period
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700">
                {employee._count.leads} leads
              </span>
            </div>
          ))}
          {!topEmployees.length && <EmptyState label="No employees active yet." />}
        </DashboardPanel>

        <DashboardPanel title="Territory Coverage" description="Active regional presence">
          {territoryCoverage.map((territory) => (
            <div key={territory.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50 transition">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 border border-teal-200">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink text-sm">
                    {territory.city}, {territory.state}
                  </p>
                  <p className="text-xs text-ink-faint">Authorized Territory</p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-800">
                {territory._count.clients} clients
              </span>
            </div>
          ))}
          {!territoryCoverage.length && (
            <EmptyState label="No territories added yet." />
          )}
        </DashboardPanel>
      </div>

      {/* 2 Bottom Panels */}
      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardPanel
          title="Repeat Customer Watch"
          description="Monthly order cadence and reorder discipline"
        >
          {repeatClients.map((client) => (
            <div key={client.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50 transition">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink text-sm">{client.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {client.territory?.city ?? "No territory"} • Owner: {client.assignedEmployee?.name ?? "Unassigned"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {client.orders[0]
                    ? `Last: ${client.orders[0].orderDate.toLocaleDateString("en-IN")}`
                    : "Awaiting 1st Order"}
                </span>
              </div>
            </div>
          ))}
          {!repeatClients.length && (
            <EmptyState label="No repeat customers marked yet." />
          )}
        </DashboardPanel>

        <section className="rounded-3xl neo-panel overflow-hidden">
          <div className="border-b border-line px-6 py-4 flex items-center justify-between bg-slate-50/40">
            <div>
              <h2 className="font-bold text-ink text-base">Stock Risk & Box Counts</h2>
              <p className="mt-0.5 text-xs text-ink-faint">SKUs below reorder threshold or nearing expiry</p>
            </div>
            <Link
              href="/admin/stock-iq"
              className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1 hover:bg-teal-100 transition"
            >
              Open Stock IQ →
            </Link>
          </div>
          <div className="divide-y divide-line-soft">
            {lowStockProducts.map((product) => {
              const isCritical = product.stockQty <= product.reorderThreshold;
              const diffDays = product.expiryDate
                ? Math.ceil(
                    (product.expiryDate.getTime() - now.getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 999;
              const isNearExpiry = diffDays <= 90;

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50 transition"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink text-sm">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-ink-faint font-mono">
                        {product.sku}
                      </span>
                      {product.batchNumber && (
                        <span className="text-[10px] text-ink-muted bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                          Batch: {product.batchNumber}
                        </span>
                      )}
                      {isNearExpiry && (
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold">
                          Exp: {diffDays}d
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-ink">
                      {product.stockQty}{" "}
                      <span className="text-ink-faint font-normal">
                        / {product.reorderThreshold} bxs
                      </span>
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                        isCritical
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                      }`}
                    >
                      {isCritical ? "REORDER NOW" : "MONITOR"}
                    </span>
                  </div>
                </div>
              );
            })}
            {!lowStockProducts.length && (
              <EmptyState label="No products synced yet." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function PanelHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="border-b border-line px-6 py-4 flex items-center justify-between bg-slate-50/40">
      <div>
        <h2 className="font-bold text-ink text-base">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-faint">{description}</p>
      </div>
      {badge && (
        <span className="rounded-full bg-primary-soft border border-primary/20 px-3 py-0.5 text-[10px] font-bold text-primary">
          {badge}
        </span>
      )}
    </div>
  );
}

function PriorityRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "amber" | "rose" | "blue" | "emerald";
}) {
  const tones = {
    amber: {
      bar: "border-l-4 border-l-amber-500",
      badge: "bg-amber-100/90 text-amber-900 border border-amber-300/80",
    },
    rose: {
      bar: "border-l-4 border-l-rose-500",
      badge: "bg-rose-100/90 text-rose-900 border border-rose-300/80",
    },
    blue: {
      bar: "border-l-4 border-l-blue-500",
      badge: "bg-blue-100/90 text-blue-900 border border-blue-300/80",
    },
    emerald: {
      bar: "border-l-4 border-l-emerald-500",
      badge: "bg-emerald-100/90 text-emerald-900 border border-emerald-300/80",
    },
  };

  return (
    <div className={`flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/60 transition ${tones[tone].bar}`}>
      <div>
        <p className="font-semibold text-ink text-sm">{label}</p>
        <p className="mt-1 text-xs text-ink-faint leading-relaxed">{detail}</p>
      </div>
      <span
        className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${tones[tone].badge}`}
      >
        {value}
      </span>
    </div>
  );
}

function DashboardPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl neo-panel overflow-hidden">
      <PanelHeader title={title} description={description} />
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="px-6 py-8 text-sm text-ink-faint text-center">{label}</p>;
}

function getPlatformTagClass(source: string) {
  switch (source) {
    case "META":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "INDIAMART":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "WHATSAPP":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "WEBSITE":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "SOCIAL":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function getStatusTagClass(status: string) {
  switch (status) {
    case "CONVERTED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "ASSIGNED":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "CONTACTED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "INTERESTED":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "NOT_INTERESTED":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-purple-100 text-purple-800 border-purple-200";
  }
}

