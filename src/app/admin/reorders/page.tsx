import Link from "next/link";
import {
  assignReorderFollowupTask,
  completeFollowupTask,
  createBilledReorder,
  triggerAiReorderReminder,
  triggerBillingReorderSync,
} from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ErpModuleGate } from "@/components/ErpModuleGate";

import { parseDashboardDateFilter } from "@/lib/date-filters";

export default async function AdminReordersPage(props: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    territory?: string;
    employee?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
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
  const hasBillingApi = Boolean(settings?.billingSoftwareApiKey && settings?.enableBillingErp);

  if ((!hasBillingApi && !isSuperAdmin) || !settings?.enableReorders) {
    return (
      <ErpModuleGate
        moduleName="Reorders & Replenishment"
        description="Tracks calculated repeat order cadence, historical basket velocity, and purchase replenishment alerts."
        erpDependency="Marg ERP 9+ or Billing API"
        icon="🔁"
      />
    );
  }

  const searchParams = await props.searchParams;
  const search = (searchParams.search || "").trim().toLowerCase();
  const statusFilter = searchParams.status || "all";
  const territoryFilter = searchParams.territory || "all";
  const employeeFilter = searchParams.employee || "all";

  const dateFilter = parseDashboardDateFilter(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const orderDateFilter =
    dateFilter.start && dateFilter.end
      ? { orderDate: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { orderDate: { gte: dateFilter.start } }
      : {};

  const now = new Date();

  // Query active clients with full territory, employee, tasks, orders and product items
  const [clients, allTerritories, allEmployees, allProducts] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...companyScope,
        status: "ACTIVE",
      },
      include: {
        territory: true,
        assignedEmployee: true,
        tasks: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
        },
        orders: {
          where: Object.keys(orderDateFilter).length > 0 ? orderDateFilter : undefined,
          orderBy: { orderDate: "desc" },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.territory.findMany({
      where: companyScope,
      orderBy: [{ state: "asc" }, { city: "asc" }],
    }),
    prisma.employee.findMany({
      where: companyScope,
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: companyScope,
      orderBy: { name: "asc" },
    }),
  ]);

  // Compute reorder metrics for each client
  const clientReorderProfiles = clients.map((client) => {
    const orders = client.orders || [];
    const lastOrder = orders[0] || null;
    const previousOrder = orders[1] || null;

    // Days since last order
    const daysSinceLastOrder = lastOrder
      ? Math.max(0, Math.floor((now.getTime() - lastOrder.orderDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 999;

    // Cadence interval (from database or inferred)
    const cadenceIntervalDays = client.avgReorderIntervalDays || 30;
    const typicalDay = client.typicalOrderDayOfMonth || 5;

    // Days until next expected reorder
    const daysUntilNextOrder = cadenceIntervalDays - daysSinceLastOrder;

    // Next expected reorder date
    const nextExpectedDate = lastOrder
      ? new Date(lastOrder.orderDate.getTime() + cadenceIntervalDays * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Cadence status
    let cadenceStatus: "DUE_NOW" | "APPROACHING" | "OVERDUE" | "HEALTHY";
    if (daysSinceLastOrder > cadenceIntervalDays + 4) {
      cadenceStatus = "OVERDUE";
    } else if (daysUntilNextOrder <= 3 && daysUntilNextOrder >= -4) {
      cadenceStatus = "DUE_NOW";
    } else if (daysUntilNextOrder > 3 && daysUntilNextOrder <= 7) {
      cadenceStatus = "APPROACHING";
    } else {
      cadenceStatus = "HEALTHY";
    }

    // Aggregate monthly product boxes & value from last 2-3 orders
    const recentOrders = orders.slice(0, 3);
    const totalRecentBoxes = recentOrders.reduce(
      (sum, ord) => sum + ord.items.reduce((s, it) => s + it.quantity, 0),
      0
    );
    const totalRecentSpend = recentOrders.reduce(
      (sum, ord) => sum + Number(ord.amount),
      0
    );
    const avgMonthlyBoxes = recentOrders.length > 0
      ? Math.round(totalRecentBoxes / recentOrders.length)
      : 0;
    const avgMonthlySpend = recentOrders.length > 0
      ? totalRecentSpend / recentOrders.length
      : 0;

    // Unique routine products ordered by this client across recent orders with LAST RATE GIVEN
    const routineProductMap = new Map<
      string,
      {
        product: (typeof allProducts)[0];
        lastRate: number;
        mrp: number;
        lastQuantity: number;
        totalBoxesOrdered: number;
        lastInvoice: string;
        lastInvoiceDate: Date;
      }
    >();

    for (const ord of orders) {
      for (const item of ord.items) {
        if (!routineProductMap.has(item.productId)) {
          routineProductMap.set(item.productId, {
            product: item.product,
            lastRate: Number(item.price),
            mrp: Number(item.product.mrp || 0),
            lastQuantity: item.quantity,
            totalBoxesOrdered: item.quantity,
            lastInvoice: ord.invoiceNumber || "MARG-DIRECT",
            lastInvoiceDate: ord.orderDate,
          });
        } else {
          const entry = routineProductMap.get(item.productId)!;
          entry.totalBoxesOrdered += item.quantity;
        }
      }
    }

    const routineProducts = Array.from(routineProductMap.values());

    return {
      client,
      orders,
      lastOrder,
      previousOrder,
      daysSinceLastOrder,
      cadenceIntervalDays,
      typicalDay,
      daysUntilNextOrder,
      nextExpectedDate,
      cadenceStatus,
      avgMonthlyBoxes,
      avgMonthlySpend,
      routineProducts,
      billingSource: lastOrder?.billingSource || "Marg ERP 9+",
    };
  });

  // Aggregate KPI Counts
  const totalActiveClients = clientReorderProfiles.length;
  const dueNowProfiles = clientReorderProfiles.filter((p) => p.cadenceStatus === "DUE_NOW");
  const overdueProfiles = clientReorderProfiles.filter((p) => p.cadenceStatus === "OVERDUE");
  const approachingProfiles = clientReorderProfiles.filter((p) => p.cadenceStatus === "APPROACHING");
  const healthyProfiles = clientReorderProfiles.filter((p) => p.cadenceStatus === "HEALTHY");

  const totalMonthlyBilledBoxes = clientReorderProfiles.reduce(
    (sum, p) => sum + p.avgMonthlyBoxes,
    0
  );
  const totalMonthlyBilledSpend = clientReorderProfiles.reduce(
    (sum, p) => sum + p.avgMonthlySpend,
    0
  );

  // Filter client profiles based on search & filters
  const filteredProfiles = clientReorderProfiles.filter((profile) => {
    const { client, routineProducts } = profile;

    // Search query
    if (search) {
      const matchName = client.name.toLowerCase().includes(search);
      const matchPhone = (client.phoneNumber || "").toLowerCase().includes(search);
      const matchDetails = (client.companyDetails || "").toLowerCase().includes(search);
      const matchCity = (client.territory?.city || "").toLowerCase().includes(search);
      const matchState = (client.territory?.state || "").toLowerCase().includes(search);
      const matchRep = (client.assignedEmployee?.name || "").toLowerCase().includes(search);
      const matchProduct = routineProducts.some(
        (rp) =>
          rp.product.name.toLowerCase().includes(search) ||
          rp.product.sku.toLowerCase().includes(search) ||
          (rp.product.composition || "").toLowerCase().includes(search)
      );

      if (
        !matchName &&
        !matchPhone &&
        !matchDetails &&
        !matchCity &&
        !matchState &&
        !matchRep &&
        !matchProduct
      ) {
        return false;
      }
    }

    // Status filter
    if (statusFilter === "due-now" && profile.cadenceStatus !== "DUE_NOW") return false;
    if (statusFilter === "overdue" && profile.cadenceStatus !== "OVERDUE") return false;
    if (statusFilter === "approaching" && profile.cadenceStatus !== "APPROACHING") return false;
    if (statusFilter === "healthy" && profile.cadenceStatus !== "HEALTHY") return false;

    // Territory filter
    if (territoryFilter !== "all" && client.territoryId !== territoryFilter) {
      return false;
    }

    // Employee filter
    if (employeeFilter !== "all" && client.assignedEmployeeId !== employeeFilter) {
      return false;
    }

    return true;
  });

  // URL builder preserving query params
  const buildFilterUrl = (overrides: {
    status?: string;
    territory?: string;
    employee?: string;
    search?: string;
  }) => {
    const s = overrides.status !== undefined ? overrides.status : statusFilter;
    const t = overrides.territory !== undefined ? overrides.territory : territoryFilter;
    const e = overrides.employee !== undefined ? overrides.employee : employeeFilter;
    const q = overrides.search !== undefined ? overrides.search : search;

    const params = new URLSearchParams();
    if (s && s !== "all") params.set("status", s);
    if (t && t !== "all") params.set("territory", t);
    if (e && e !== "all") params.set("employee", e);
    if (q && q.trim()) params.set("search", q.trim());

    const qs = params.toString();
    return qs ? `/admin/reorders?${qs}` : "/admin/reorders";
  };

  return (
    <div className="space-y-8">
      {/* ERP Billing System Status Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-teal-500">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-gradient-to-br from-teal-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                Source: Billing Software API
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                Marg ERP 9+ & Busy Accounting 21 Sync Active
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Auto-Cadence Intelligence
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Monthly Reorders & Client Cadence Intelligence
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Live tracking of repeat purchasing behavior sourced directly from billing invoices. 
              Monitor active franchise clients, assigned territory representatives, monthly formulation volumes, 
              last rates given per product, and predicted monthly reorder dates.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <form action={triggerBillingReorderSync}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:from-teal-700 hover:to-emerald-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Billing Reorders
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 4 KPI Metric Summary Cards */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <ReorderKpiCard
          title="Active Reordering Clients"
          value={`${totalActiveClients} Accounts`}
          detail={`${dueNowProfiles.length} clients due for monthly reorder`}
          topBar="from-teal-400 via-emerald-500 to-teal-600"
          icon="👥"
          badge={`${totalActiveClients} Tracked`}
          badgeTone="teal"
        />

        <ReorderKpiCard
          title="Monthly Billed Volume"
          value={`${totalMonthlyBilledBoxes.toLocaleString("en-IN")} Boxes`}
          detail={`₹${(totalMonthlyBilledSpend / 100000).toFixed(2)} Lakhs average monthly revenue`}
          topBar="from-indigo-400 via-blue-500 to-indigo-600"
          icon="📦"
          badge="Billing Verified"
          badgeTone="blue"
        />

        <ReorderKpiCard
          title="Reorders Due Now (≤ 3d)"
          value={`${dueNowProfiles.length} Accounts`}
          detail="Within standard monthly reorder date window"
          topBar="from-amber-400 via-orange-500 to-amber-600"
          icon="⏳"
          badge="Dispatch Pipeline"
          badgeTone="amber"
        />

        <ReorderKpiCard
          title="Cadence Delayed / Overdue"
          value={`${overdueProfiles.length} Accounts`}
          detail="Exceeded agreed client reorder cadence"
          topBar="from-rose-400 via-red-500 to-rose-600"
          icon="⚠️"
          badge="Churn Risk Alert"
          badgeTone="rose"
        />
      </section>

      {/* Interactive Filters: Status Tabs, Territory, Employee & Search */}
      <section className="rounded-3xl p-6 neo-panel space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="font-bold text-ink text-base">Filter Reorder Intelligence</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Segment accounts by cadence urgency, regional territory, or assigned field representative.
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildFilterUrl({ status: "all" })}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                statusFilter === "all"
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-white text-ink-muted border-line hover:text-ink neo-button"
              }`}
            >
              All ({totalActiveClients})
            </Link>
            <Link
              href={buildFilterUrl({ status: "due-now" })}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                statusFilter === "due-now"
                  ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                  : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
              }`}
            >
              Due Now ({dueNowProfiles.length})
            </Link>
            <Link
              href={buildFilterUrl({ status: "overdue" })}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                statusFilter === "overdue"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              }`}
            >
              Delayed / Risk ({overdueProfiles.length})
            </Link>
            <Link
              href={buildFilterUrl({ status: "healthy" })}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                statusFilter === "healthy"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Healthy ({healthyProfiles.length})
            </Link>
          </div>
        </div>

        {/* Secondary Filter Row: Search, Territory, Employee */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Bar */}
          <form method="GET" action="/admin/reorders" className="flex items-center gap-2 flex-1 max-w-md">
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="territory" value={territoryFilter} />
            <input type="hidden" name="employee" value={employeeFilter} />
            <div className="relative w-full">
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search client, drug license, city, product molecule..."
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-1.5 text-xs text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-ink neo-button hover:text-primary transition"
            >
              Search
            </button>
            {search && (
              <Link
                href={buildFilterUrl({ search: "" })}
                className="text-xs text-rose-600 hover:underline shrink-0 font-semibold"
              >
                Clear
              </Link>
            )}
          </form>

          {/* Territory & Employee Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-ink-muted">Territory:</span>
              <div className="flex flex-wrap gap-1">
                <Link
                  href={buildFilterUrl({ territory: "all" })}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold border transition ${
                    territoryFilter === "all"
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-ink-muted border-line hover:text-teal-700"
                  }`}
                >
                  All
                </Link>
                {allTerritories.map((t) => (
                  <Link
                    key={t.id}
                    href={buildFilterUrl({ territory: t.id })}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold border transition ${
                      territoryFilter === t.id
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-ink-muted border-line hover:text-teal-700"
                    }`}
                  >
                    {t.city}
                  </Link>
                ))}
              </div>
            </div>

            {(territoryFilter !== "all" || employeeFilter !== "all" || statusFilter !== "all" || search) && (
              <Link
                href="/admin/reorders"
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 hover:underline ml-1"
              >
                Reset
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Client Reorder Detail Cards */}
      <section className="space-y-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-extrabold text-ink">
            Active Accounts ({filteredProfiles.length} Matching Criteria)
          </h2>
          <span className="text-xs text-ink-faint">
            Sorted by reorder urgency & monthly volume
          </span>
        </div>

        {filteredProfiles.map((profile) => {
          const { client, routineProducts, lastOrder } = profile;

          const cleanPhone = (client.phoneNumber || "").replace(/[^0-9]/g, "");
          const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
          const waProductLines = routineProducts
            .slice(0, 3)
            .map((rp) => `• ${rp.product.name}: ${rp.lastQuantity} Boxes @ ₹${rp.lastRate.toFixed(2)}/box`)
            .join("\n");
          const waMessage = encodeURIComponent(
            `*ALLOTA AI - REORDER REMINDER* 📦\n\nHello *${client.name}*,\nThis is a friendly reminder that your monthly order cadence (~${profile.cadenceIntervalDays} days) is ${profile.cadenceStatus === "OVERDUE" ? "OVERDUE" : "DUE"}.\n\n*Recommended Replenishment Basket:*\n${waProductLines}\n\n*Billing Estimate:* ₹${Number(profile.avgMonthlySpend).toLocaleString("en-IN")} (${profile.billingSource})\n\nKindly confirm if we should release this dispatch to ${client.territory?.city || "your area"}.\n\n*Assigned MR:* ${client.assignedEmployee?.name || "Field Rep"} (${client.assignedEmployee?.phoneNumber || ""})`
          );
          const whatsappUrl = cleanPhone.length >= 10 ? `https://wa.me/${formattedPhone}?text=${waMessage}` : "#";

          return (
            <div
              key={client.id}
              className="rounded-3xl p-6 neo-panel transition-all hover:shadow-md border border-line"
            >
              {/* Header: Client Identity, Area & Assigned MR */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-line pb-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-black text-ink">{client.name}</h3>
                    <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-ink-muted font-mono">
                      {client.phoneNumber || "No Phone"}
                    </span>
                    <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 text-[11px] font-bold">
                      Source: {profile.billingSource}
                    </span>
                  </div>

                  <p className="text-xs text-ink-muted mt-1 font-mono">
                    {client.companyDetails || "Licensed Pharma Distributor"}
                  </p>

                  {/* Area Territory & Assigned MR */}
                  <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs">
                    <div className="flex items-center gap-1.5 text-ink font-semibold">
                      <span className="text-slate-400">📍 Area:</span>
                      <span className="rounded-md bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 font-bold">
                        {client.territory
                          ? `${client.territory.city}, ${client.territory.state}`
                          : "Unallocated Area"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-ink font-semibold">
                      <span className="text-slate-400">👤 Assigned MR:</span>
                      <span className="rounded-md bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 font-bold">
                        {client.assignedEmployee?.name || "Unassigned"} ({client.assignedEmployee?.phoneNumber || "No Phone"})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cadence Status Badge & Quick Action */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                  <div className="text-right sm:text-left">
                    {profile.cadenceStatus === "OVERDUE" ? (
                      <div className="rounded-xl bg-rose-50 border border-rose-300 p-2.5 text-right sm:text-left">
                        <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs">
                          <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
                          Cadence Delayed ({profile.daysSinceLastOrder}d ago)
                        </div>
                        <p className="text-[11px] text-rose-700 font-semibold mt-0.5">
                          Overdue by {profile.daysSinceLastOrder - profile.cadenceIntervalDays} days · Churn Risk
                        </p>
                      </div>
                    ) : profile.cadenceStatus === "DUE_NOW" ? (
                      <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5 text-right sm:text-left">
                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                          <span className="h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
                          Reorder Due Now ({profile.daysUntilNextOrder <= 0 ? "Today" : `In ${profile.daysUntilNextOrder} days`})
                        </div>
                        <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
                          Expected: {profile.nextExpectedDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    ) : profile.cadenceStatus === "APPROACHING" ? (
                      <div className="rounded-xl bg-blue-50 border border-blue-300 p-2.5 text-right sm:text-left">
                        <div className="flex items-center gap-1.5 text-blue-800 font-bold text-xs">
                          <span className="h-2 w-2 rounded-full bg-blue-600" />
                          Upcoming in {profile.daysUntilNextOrder} days
                        </div>
                        <p className="text-[11px] text-blue-700 font-semibold mt-0.5">
                          Expected: {profile.nextExpectedDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-2.5 text-right sm:text-left">
                        <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                          <span className="h-2 w-2 rounded-full bg-emerald-600" />
                          Healthy Cadence (Ordered {profile.daysSinceLastOrder}d ago)
                        </div>
                        <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                          Next Cycle in {profile.daysUntilNextOrder} days
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Employee Follow-up Task & WhatsApp Workflow */}
                  <div className="flex flex-wrap items-center gap-2">
                    {client.tasks && client.tasks.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-purple-50 text-purple-800 border border-purple-200 px-3 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs">
                          <span className="h-2 w-2 rounded-full bg-purple-600 animate-pulse" />
                          <span>Task with {client.assignedEmployee ? client.assignedEmployee.name.split(" ")[0] : "Representative"}</span>
                        </span>
                        <form action={completeFollowupTask}>
                          <input type="hidden" name="taskId" value={client.tasks[0].id} />
                          <button
                            type="submit"
                            className="rounded-xl bg-slate-100 hover:bg-slate-200 text-ink-muted hover:text-ink border border-line px-2.5 py-2 text-xs font-bold transition cursor-pointer"
                            title="Mark follow-up task as completed"
                          >
                            ✓ Done
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form action={assignReorderFollowupTask} className="flex items-center gap-2">
                        <input type="hidden" name="clientId" value={client.id} />
                        <input
                          type="hidden"
                          name="priority"
                          value={profile.cadenceStatus === "OVERDUE" ? "URGENT" : "HIGH"}
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs hover:shadow-md transition flex items-center gap-1.5 cursor-pointer"
                          title={`Assign urgent monthly reorder follow-up task to ${client.assignedEmployee?.name || "the representative"}`}
                        >
                          <svg className="h-3.5 w-3.5 fill-none stroke-current" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          <span>Assign Task to {client.assignedEmployee ? client.assignedEmployee.name.split(" ")[0] : "Representative"}</span>
                        </button>
                      </form>
                    )}

                    {/* Quick WhatsApp Reminder Link */}
                    {whatsappUrl !== "#" && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Send WhatsApp draft directly to client"
                      >
                        <svg className="h-3.5 w-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                        </svg>
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Cadence Metrics Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-b border-line bg-slate-50/50 -mx-6 px-6">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-ink-faint">
                    Average Monthly Reorder Date
                  </p>
                  <p className="text-sm font-extrabold text-ink mt-0.5">
                    Typically {profile.typicalDay}th – {profile.typicalDay + 3}th of Month
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    Cycle cadence: ~{profile.cadenceIntervalDays} days
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-ink-faint">
                    Last Billed Order
                  </p>
                  <p className="text-sm font-extrabold text-ink mt-0.5">
                    {lastOrder
                      ? lastOrder.orderDate.toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "No prior order"}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    {profile.daysSinceLastOrder} days ago ({lastOrder?.invoiceNumber || "N/A"})
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-ink-faint">
                    Monthly Box Volume
                  </p>
                  <p className="text-sm font-extrabold text-ink mt-0.5">
                    {profile.avgMonthlyBoxes.toLocaleString("en-IN")} Boxes / Month
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    Across {routineProducts.length} formulations
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-ink-faint">
                    Monthly Reorder Value
                  </p>
                  <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                    ₹{(profile.avgMonthlySpend / 100000).toFixed(2)} Lakhs
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    Billing Rate Average
                  </p>
                </div>
              </div>

              {/* Routine Products Ordered & Last Rates Given (₹) */}
              <div className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Routine Products Ordered & Last Rates Given (Marg ERP / Busy Billed)
                  </h4>
                  <span className="text-[11px] font-semibold text-ink-faint">
                    Franchise Pricing Protection Active
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-ink-faint bg-slate-50/70">
                        <th className="py-2.5 px-3">Formulation & Molecule</th>
                        <th className="py-2.5 px-3">Product Type</th>
                        <th className="py-2.5 px-3">Last Billed Rate (₹)</th>
                        <th className="py-2.5 px-3">Standard MRP (₹)</th>
                        <th className="py-2.5 px-3">Franchise Margin</th>
                        <th className="py-2.5 px-3">Last Order Qty</th>
                        <th className="py-2.5 px-3">Billing Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {routineProducts.map((rp) => {
                        const discountPct =
                          rp.mrp > 0
                            ? Math.round(((rp.mrp - rp.lastRate) / rp.mrp) * 100)
                            : 0;

                        return (
                          <tr key={rp.product.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-ink">{rp.product.name}</p>
                              <p className="text-[10px] text-ink-faint font-mono">
                                SKU: {rp.product.sku} · {rp.product.composition || "Pharma Salt"}
                              </p>
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="inline-block rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-ink">
                                {rp.product.dosageForm || "Tablets"}
                              </span>
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="font-black text-emerald-700 text-sm">
                                ₹{rp.lastRate.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-ink-faint ml-1">/ box</span>
                            </td>

                            <td className="py-2.5 px-3 text-ink-muted">
                              ₹{rp.mrp.toFixed(2)}
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                                {discountPct}% Off MRP
                              </span>
                            </td>

                            <td className="py-2.5 px-3 font-bold text-ink">
                              {rp.lastQuantity.toLocaleString("en-IN")}{" "}
                              <span className="font-normal text-ink-faint">Boxes</span>
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="font-mono text-[10px] text-ink-muted bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {rp.lastInvoice}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredProfiles.length && (
          <div className="rounded-3xl p-12 text-center neo-panel text-ink-faint text-sm">
            No active clients matched your search or filter criteria. Try resetting the filters.
          </div>
        )}
      </section>

      {/* Record Billed Reorder Invoice Modal/Form */}
      <section className="rounded-3xl p-6 neo-panel">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-bold text-ink text-base">
              Record New Billed Reorder from Billing System
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Record an offline purchase order or sync invoice from Marg ERP / Busy Accounting.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 text-xs font-bold">
            Live Reorder Dispatch
          </span>
        </div>

        <form action={createBilledReorder} className="mt-5 grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Select Active Client *
            </label>
            <select name="clientId" className={formInputClass} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.territory?.city || "Area"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Select Medicine SKU *
            </label>
            <select name="productId" className={formInputClass} required>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.dosageForm || "Tablets"}) - Stock: {p.stockQty} bxs
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Reorder Quantity (Boxes) *
            </label>
            <input
              name="quantity"
              type="number"
              min="1"
              defaultValue="200"
              required
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Agreed Billing Rate per Box (₹) *
            </label>
            <input
              name="rate"
              type="number"
              step="0.1"
              min="1"
              defaultValue="42.5"
              required
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Billing Invoice Number
            </label>
            <input
              name="invoiceNumber"
              placeholder="e.g. MARG-INV-2026-9901"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Billing Software Source
            </label>
            <select name="billingSource" className={formInputClass} defaultValue="Marg ERP 9+">
              <option value="Marg ERP 9+">Marg ERP 9+ API</option>
              <option value="Busy Accounting">Busy Accounting 21</option>
              <option value="Direct Warehouse Dispatch">Direct Warehouse Dispatch</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg transition cursor-pointer"
            >
              + Record Billed Reorder & Update Cadence
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReorderKpiCard({
  title,
  value,
  detail,
  topBar,
  icon,
  badge,
  badgeTone,
}: {
  title: string;
  value: string;
  detail: string;
  topBar: string;
  icon: string;
  badge: string;
  badgeTone: "teal" | "blue" | "amber" | "rose";
}) {
  const toneMap = {
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className="relative overflow-hidden rounded-3xl neo-panel-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className={`h-1.5 w-full bg-gradient-to-r ${topBar}`} />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            {title}
          </p>
          <span className="text-2xl">{icon}</span>
        </div>

        <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
          {value}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted truncate max-w-[200px]">
            {detail}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${toneMap[badgeTone]}`}>
            {badge}
          </span>
        </div>
      </div>
    </div>
  );
}

const formInputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition";
