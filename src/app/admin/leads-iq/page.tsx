import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { getSession, getActiveCompanyId, scopeToCompany, scopeViaRelation } from "@/lib/auth";
import { parseDashboardDateFilter } from "@/lib/date-filters";

interface LeadsIqPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function LeadsIqPage(props: LeadsIqPageProps) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = scopeToCompany(activeCompanyId);

  const searchParams = props.searchParams ? await props.searchParams : {};
  const dateFilter = parseDashboardDateFilter(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const leadDateFilter =
    dateFilter.start && dateFilter.end
      ? { createdAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { createdAt: { gte: dateFilter.start } }
      : {};

  const callDateFilter =
    dateFilter.start && dateFilter.end
      ? { occurredAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { occurredAt: { gte: dateFilter.start } }
      : {};

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000);

  // Fetch all live lead & employee intelligence in parallel
  const [
    leadsBySourceAndStatus,
    leadsByDivisionAndStatus,
    employees,
    allCalls,
    stagnantLeads,
    totalLeadsCount,
    totalUnassignedCount,
  ] = await Promise.all([
    prisma.lead.groupBy({
      by: ["source", "status"],
      where: { ...companyScope, ...leadDateFilter },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["division", "status"],
      where: { ...companyScope, ...leadDateFilter },
      _count: { _all: true },
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: {
        leads: {
          where: leadDateFilter,
          select: {
            id: true,
            division: true,
            status: true,
            createdAt: true,
            _count: { select: { calls: true } },
          },
        },
        calls: {
          where: callDateFilter,
          select: {
            id: true,
            durationSec: true,
            missed: true,
            occurredAt: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.call.findMany({
      where: {
        ...scopeViaRelation(activeCompanyId, "employee"),
        ...callDateFilter,
      },
      select: {
        id: true,
        durationSec: true,
        missed: true,
        lead: { select: { source: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        ...companyScope,
        ...leadDateFilter,
        assignedEmployeeId: { not: null },
        status: { in: [LeadStatus.ASSIGNED, LeadStatus.NEW] },
        calls: { none: {} },
        createdAt: { lt: fortyEightHoursAgo },
      },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter } }),
    prisma.lead.count({ where: { ...companyScope, ...leadDateFilter, assignedEmployeeId: null } }),
  ]);

  // Source-level metrics
  const sourceStatsMap = new Map<
    LeadSource,
    { total: number; converted: number; inProgress: number; lost: number }
  >();

  for (const item of leadsBySourceAndStatus) {
    const existing = sourceStatsMap.get(item.source) || {
      total: 0,
      converted: 0,
      inProgress: 0,
      lost: 0,
    };
    existing.total += item._count._all;
    if (item.status === LeadStatus.CONVERTED) {
      existing.converted += item._count._all;
    } else if (
      item.status === LeadStatus.CONTACTED ||
      item.status === LeadStatus.INTERESTED ||
      item.status === LeadStatus.ASSIGNED
    ) {
      existing.inProgress += item._count._all;
    } else if (item.status === LeadStatus.NOT_INTERESTED) {
      existing.lost += item._count._all;
    }
    sourceStatsMap.set(item.source, existing);
  }

  // Division-level metrics
  const divisionStatsMap = new Map<
    string,
    {
      total: number;
      newLeads: number;
      assigned: number;
      contacted: number;
      interested: number;
      converted: number;
      lost: number;
    }
  >();

  for (const item of leadsByDivisionAndStatus) {
    const div = item.division || "PCD_FRANCHISE";
    const existing = divisionStatsMap.get(div) || {
      total: 0,
      newLeads: 0,
      assigned: 0,
      contacted: 0,
      interested: 0,
      converted: 0,
      lost: 0,
    };
    existing.total += item._count._all;
    if (item.status === LeadStatus.NEW) existing.newLeads += item._count._all;
    if (item.status === LeadStatus.ASSIGNED) existing.assigned += item._count._all;
    if (item.status === LeadStatus.CONTACTED) existing.contacted += item._count._all;
    if (item.status === LeadStatus.INTERESTED) existing.interested += item._count._all;
    if (item.status === LeadStatus.CONVERTED) existing.converted += item._count._all;
    if (item.status === LeadStatus.NOT_INTERESTED) existing.lost += item._count._all;
    divisionStatsMap.set(div, existing);
  }

  const pcdStats = divisionStatsMap.get("PCD_FRANCHISE") || {
    total: 0,
    newLeads: 0,
    assigned: 0,
    contacted: 0,
    interested: 0,
    converted: 0,
    lost: 0,
  };
  const tpStats = divisionStatsMap.get("THIRD_PARTY") || {
    total: 0,
    newLeads: 0,
    assigned: 0,
    contacted: 0,
    interested: 0,
    converted: 0,
    lost: 0,
  };

  const totalConverted =
    leadsBySourceAndStatus
      .filter((l) => l.status === LeadStatus.CONVERTED)
      .reduce((acc, curr) => acc + curr._count._all, 0);

  const overallConversionPct =
    totalLeadsCount > 0 ? Math.round((totalConverted / totalLeadsCount) * 100) : 0;

  // Calls telemetry
  const totalCalls = allCalls.length;
  const connectedCalls = allCalls.filter((c) => !c.missed).length;
  const totalDurationMinutes = Math.round(
    allCalls.reduce((sum, c) => sum + (c.durationSec || 0), 0) / 60
  );

  const sourcesList: {
    source: LeadSource;
    name: string;
    icon: string;
    color: string;
    border: string;
  }[] = [
    {
      source: LeadSource.META,
      name: "Meta Ads (FB/IG)",
      icon: "🌐",
      color: "text-blue-700",
      border: "border-l-blue-600",
    },
    {
      source: LeadSource.INDIAMART,
      name: "IndiaMART BuyLead",
      icon: "🛒",
      color: "text-amber-700",
      border: "border-l-amber-500",
    },
    {
      source: LeadSource.PHARMAHOPERS,
      name: "PharmaHopers Portal",
      icon: "💊",
      color: "text-sky-700",
      border: "border-l-sky-600",
    },
    {
      source: LeadSource.WHATSAPP,
      name: "WhatsApp Inbound",
      icon: "💬",
      color: "text-emerald-700",
      border: "border-l-emerald-600",
    },
    {
      source: LeadSource.EXCEL_IMPORT,
      name: "Excel Bulk Imports",
      icon: "📊",
      color: "text-teal-700",
      border: "border-l-teal-600",
    },
    {
      source: LeadSource.WEBSITE,
      name: "Website Forms",
      icon: "🖥️",
      color: "text-purple-700",
      border: "border-l-purple-600",
    },
    {
      source: LeadSource.SOCIAL,
      name: "Social Signals",
      icon: "📱",
      color: "text-rose-700",
      border: "border-l-rose-600",
    },
    {
      source: LeadSource.MANUAL,
      name: "Field / Manual",
      icon: "📝",
      color: "text-slate-700",
      border: "border-l-slate-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-teal-500">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                Pure Database Intelligence
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Zero Assumptions • Real Rep Activity
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Leads IQ & Velocity Analytics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Deep telecalling conversion analytics, source efficiency, stage velocity funnels for PCD Franchise & Third-Party Manufacturing, 
              and employee turnaround accountability.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 text-center shrink-0">
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Total Leads
              </p>
              <p className="mt-1 text-2xl font-extrabold text-ink">{totalLeadsCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Converted
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-600">
                {totalConverted}
              </p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Conversion
              </p>
              <p className="mt-1 text-2xl font-extrabold text-teal-600">
                {overallConversionPct}%
              </p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Calls Logged
              </p>
              <p className="mt-1 text-2xl font-extrabold text-blue-600">{totalCalls}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Channel Performance & Conversion Rates (Source Efficiency Matrix) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">
              Channel Efficiency & Conversion Matrix
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Live funnel conversion rates computed per acquisition channel
            </p>
          </div>
          <Link
            href="/admin/sources"
            className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
          >
            <span>Manage Sources & Upload Excel</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sourcesList.map((item) => {
            const stats = sourceStatsMap.get(item.source) || {
              total: 0,
              converted: 0,
              inProgress: 0,
              lost: 0,
            };
            const convPct =
              stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

            return (
              <div
                key={item.source}
                className={`rounded-2xl p-5 neo-panel bg-white border-l-4 ${item.border} hover:shadow-md transition`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-extrabold text-ink">{item.name}</span>
                  </div>
                  <span className="text-xs font-black text-ink">{stats.total} leads</span>
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-extrabold text-ink">{convPct}%</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                      Conversion Rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">
                      {stats.converted} Converted
                    </p>
                    <p className="text-xs text-ink-faint">
                      {stats.inProgress} in pipeline
                    </p>
                  </div>
                </div>

                {/* Micro Progress Bar */}
                <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 flex">
                  <div
                    style={{ width: `${convPct}%` }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                  <div
                    style={{
                      width: `${
                        stats.total > 0
                          ? Math.round((stats.inProgress / stats.total) * 100)
                          : 0
                      }%`,
                    }}
                    className="h-full bg-blue-400"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. PCD Franchise vs Third-Party Manufacturing Velocity Comparison */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* PCD Pharma Franchise */}
        <div className="rounded-3xl p-6 neo-panel bg-white border-t-2 border-t-blue-600">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-base">
                🏢
              </span>
              <div>
                <h3 className="font-extrabold text-ink text-base">
                  PCD Pharma Franchise Velocity
                </h3>
                <p className="text-xs text-ink-muted">Distributors, Chemists & Monopoly Seekers</p>
              </div>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 text-xs font-bold">
                {pcdStats.total} Inquiries
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-center">
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-purple-700">NEW</p>
              <p className="mt-1 text-lg font-black text-ink">{pcdStats.newLeads}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-blue-700">CONTACTED</p>
              <p className="mt-1 text-lg font-black text-ink">{pcdStats.contacted}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-teal-700">INTERESTED</p>
              <p className="mt-1 text-lg font-black text-ink">{pcdStats.interested}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-emerald-700">CONVERTED</p>
              <p className="mt-1 text-lg font-black text-emerald-700">{pcdStats.converted}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-rose-700">LOST</p>
              <p className="mt-1 text-lg font-black text-ink">{pcdStats.lost}</p>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-line flex items-center justify-between text-xs">
            <span className="text-ink-muted">Monopoly Deal Win Rate:</span>
            <span className="font-extrabold text-blue-800 text-sm">
              {pcdStats.total > 0
                ? Math.round((pcdStats.converted / pcdStats.total) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Third-Party Manufacturing */}
        <div className="rounded-3xl p-6 neo-panel bg-white border-t-2 border-t-purple-600">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-base">
                🏭
              </span>
              <div>
                <h3 className="font-extrabold text-ink text-base">
                  Third-Party Manufacturing Velocity
                </h3>
                <p className="text-xs text-ink-muted">Contract Formulations, Softgel & Tablets</p>
              </div>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1 text-xs font-bold">
                {tpStats.total} Inquiries
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-center">
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-purple-700">NEW</p>
              <p className="mt-1 text-lg font-black text-ink">{tpStats.newLeads}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-blue-700">CONTACTED</p>
              <p className="mt-1 text-lg font-black text-ink">{tpStats.contacted}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-teal-700">INTERESTED</p>
              <p className="mt-1 text-lg font-black text-ink">{tpStats.interested}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-emerald-700">CONVERTED</p>
              <p className="mt-1 text-lg font-black text-emerald-700">{tpStats.converted}</p>
            </div>
            <div className="rounded-xl p-3 neo-pressed">
              <p className="text-xs font-bold text-rose-700">LOST</p>
              <p className="mt-1 text-lg font-black text-ink">{tpStats.lost}</p>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-line flex items-center justify-between text-xs">
            <span className="text-ink-muted">Commercial Contract Win Rate:</span>
            <span className="font-extrabold text-purple-800 text-sm">
              {tpStats.total > 0
                ? Math.round((tpStats.converted / tpStats.total) * 100)
                : 0}
              %
            </span>
          </div>
        </div>
      </section>

      {/* 3. Sales Rep Telecalling Accountability & Conversion Leaderboard */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">
              Sales Rep Telecaller Performance
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Live breakdown of leads assigned, calls completed, and conversion rate per employee
            </p>
          </div>
          <Link
            href="/admin/employees"
            className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
          >
            <span>Employee Directory</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3.5">Representative</th>
                  <th className="px-4 py-3.5">Total Leads</th>
                  <th className="px-4 py-3.5">PCD vs Third-Party</th>
                  <th className="px-4 py-3.5">Calls Logged</th>
                  <th className="px-4 py-3.5">Converted</th>
                  <th className="px-4 py-3.5">Win Rate</th>
                  <th className="px-5 py-3.5 text-right">Rep Insight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {employees.map((emp) => {
                  const empTotal = emp.leads.length;
                  const empPcd = emp.leads.filter(
                    (l) => l.division === "PCD_FRANCHISE"
                  ).length;
                  const empTp = emp.leads.filter(
                    (l) => l.division === "THIRD_PARTY"
                  ).length;
                  const empConverted = emp.leads.filter(
                    (l) => l.status === LeadStatus.CONVERTED
                  ).length;
                  const winRate =
                    empTotal > 0 ? Math.round((empConverted / empTotal) * 100) : 0;
                  const totalEmpCalls = emp.calls.length;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-4 font-bold text-ink">
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          className="hover:text-teal-700 transition"
                        >
                          {emp.name}
                        </Link>
                        <p className="text-[10px] text-ink-faint font-mono">
                          {emp.phoneNumber}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-extrabold text-ink">
                        {empTotal} leads
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-blue-50 text-blue-800 px-1.5 py-0.5 text-[10px] font-bold">
                            {empPcd} PCD
                          </span>
                          <span className="rounded bg-purple-50 text-purple-800 px-1.5 py-0.5 text-[10px] font-bold">
                            {empTp} TP
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-ink">
                        {totalEmpCalls} calls
                      </td>
                      <td className="px-4 py-4 font-extrabold text-emerald-700">
                        {empConverted}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            winRate >= 20
                              ? "bg-emerald-100 text-emerald-800"
                              : winRate >= 10
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {winRate}%
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-ink hover:bg-teal-50 hover:text-teal-800 transition"
                        >
                          <span>View Leads</span>
                          <span>&rarr;</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Stagnant / Dead Lead Recovery Desk */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-lg font-extrabold text-ink">
              Stagnant Leads Watchlist (&gt;48h Without Call)
            </h2>
          </div>
          <Link
            href="/admin/leads-reassign"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 shadow-xs transition"
          >
            <span>⚡ Open Leads Reassign Desk</span>
            <span>&rarr;</span>
          </Link>
        </div>

        {stagnantLeads.length === 0 ? (
          <div className="rounded-2xl p-6 neo-panel text-center bg-white border border-line">
            <p className="text-sm font-bold text-emerald-700">
              ✓ Excellent Rep Turnaround! Zero stagnant leads found.
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              All leads assigned over 48 hours ago have received active telecalling touches.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl neo-panel bg-white border border-rose-200 overflow-hidden">
            <div className="p-4 bg-rose-50/60 border-b border-rose-100 text-xs text-rose-900 font-medium">
              These leads were assigned over 48 hours ago but have <strong>0 call logs</strong>. 
              Recommend reallocating them immediately via Leads Reassign to avoid losing commercial intent.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3">Lead Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Assigned Rep</th>
                    <th className="px-4 py-3">Idle Time</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stagnantLeads.map((lead) => {
                    const hoursIdle = Math.round(
                      (Date.now() - new Date(lead.createdAt).getTime()) / (3600 * 1000)
                    );
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5 font-bold text-ink">{lead.name}</td>
                        <td className="px-4 py-3.5 font-mono text-ink-muted">
                          {lead.phoneNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              lead.division === "THIRD_PARTY"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {lead.division === "THIRD_PARTY"
                              ? "Third-Party"
                              : "PCD Franchise"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-ink">
                          {lead.assignedEmployee?.name || "Unassigned"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                            {hoursIdle} hrs uncontacted
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/admin/leads-reassign?search=${encodeURIComponent(
                              lead.phoneNumber || lead.name || ""
                            )}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-800 hover:bg-rose-100 transition"
                          >
                            <span>Reassign Now</span>
                            <span>&rarr;</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
