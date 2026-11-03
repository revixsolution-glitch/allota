import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeViaRelation } from "@/lib/auth";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";

function dayBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

interface FollowUpsPageProps {
  searchParams?: Promise<{
    employeeId?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    tab?: string;
    search?: string;
  }>;
}

export default async function FollowUpsPage(props: FollowUpsPageProps) {
  const resolvedParams = props.searchParams ? await props.searchParams : {};
  const employeeId = resolvedParams.employeeId || "";
  const activeTab = (resolvedParams.tab || "all").toLowerCase();
  const search = (resolvedParams.search || "").trim().toLowerCase();

  const dateFilter = parseDashboardDateFilter(
    resolvedParams.range,
    resolvedParams.from,
    resolvedParams.to
  );

  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  const dateWhere = dateFilter.start && dateFilter.end
    ? { scheduledFor: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { scheduledFor: { gte: dateFilter.start } }
    : {};

  const logs = await prisma.leadFollowUpLog.findMany({
    where: {
      ...scopeViaRelation(activeCompanyId, "lead"),
      ...dateWhere,
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      lead: { select: { id: true, name: true, phoneNumber: true, followUpAt: true, status: true } },
      employee: { select: { name: true } },
    },
    orderBy: [{ leadId: "asc" }, { createdAt: "asc" }],
  });

  // Assign a 1st/2nd/3rd... sequence number per lead, then re-sort newest activity first.
  const sequenceByLeadId = new Map<string, number>();
  const withSequence = logs.map((log) => {
    const seq = (sequenceByLeadId.get(log.leadId) || 0) + 1;
    sequenceByLeadId.set(log.leadId, seq);
    return { ...log, sequence: seq };
  });
  withSequence.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const repName = employeeId
    ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }))?.name ?? null
    : null;

  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayBounds(now);

  const overdueList = withSequence.filter(
    (l) => l.lead.followUpAt && l.scheduledFor.getTime() === l.lead.followUpAt.getTime() && l.scheduledFor < todayStart
  );
  const todayList = withSequence.filter(
    (l) =>
      l.lead.followUpAt &&
      l.scheduledFor.getTime() === l.lead.followUpAt.getTime() &&
      l.scheduledFor >= todayStart &&
      l.scheduledFor < todayEnd
  );
  const upcomingList = withSequence.filter(
    (l) =>
      l.lead.followUpAt &&
      l.scheduledFor.getTime() === l.lead.followUpAt.getTime() &&
      l.scheduledFor >= todayEnd
  );

  const totalScheduled = withSequence.length;
  const overdueCount = overdueList.length;
  const todayCount = todayList.length;
  const upcomingCount = upcomingList.length;

  // 1. Select logs based on active tab filter
  let visibleLogs = withSequence;
  if (activeTab === "overdue") {
    visibleLogs = overdueList;
  } else if (activeTab === "today") {
    visibleLogs = todayList;
  } else if (activeTab === "upcoming") {
    visibleLogs = upcomingList;
  }

  // 2. Search filter (supports digit-normalized phone search)
  if (search) {
    const cleanSearchDigits = search.replace(/\D/g, "");
    visibleLogs = visibleLogs.filter((l) => {
      const name = (l.lead.name || "").toLowerCase();
      const phone = (l.lead.phoneNumber || "").toLowerCase();
      const cleanPhoneDigits = phone.replace(/\D/g, "");
      const rep = (l.employee.name || "").toLowerCase();
      const phoneMatches =
        phone.includes(search) ||
        (cleanSearchDigits.length >= 3 && cleanPhoneDigits.includes(cleanSearchDigits));
      return name.includes(search) || phoneMatches || rep.includes(search);
    });
  }

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(resolvedParams.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedSequence = visibleLogs.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const buildFollowUpsUrl = (options: { page?: number; tab?: string }) => {
    const sp = new URLSearchParams();
    const t = options.tab !== undefined ? options.tab : activeTab;
    const p = options.page !== undefined ? options.page : 1;

    if (t && t !== "all") sp.set("tab", t);
    if (resolvedParams.employeeId) sp.set("employeeId", resolvedParams.employeeId);
    if (resolvedParams.search) sp.set("search", resolvedParams.search);
    if (resolvedParams.range) sp.set("range", resolvedParams.range);
    if (resolvedParams.from) sp.set("from", resolvedParams.from);
    if (resolvedParams.to) sp.set("to", resolvedParams.to);
    if (p > 1) sp.set("page", String(p));

    const qs = sp.toString();
    return qs ? `/admin/follow-ups?${qs}` : "/admin/follow-ups";
  };

  return (
    <div className="space-y-6 pb-28">
      {repName && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900">
          Showing only <strong>{repName}</strong>
          <Link href="/admin/follow-ups" className="ml-auto text-xs font-bold text-sky-700 underline">Show everyone</Link>
        </div>
      )}

      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-sky-500/70 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
                Representative Activity Log
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Follow <GradientText>Ups</GradientText></h1>
          </div>

          {/* Interactive KPI Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <Link
              href={buildFollowUpsUrl({ tab: "all", page: 1 })}
              className={`rounded-2xl px-3.5 py-2.5 text-center transition ${
                activeTab === "all"
                  ? "bg-slate-900 text-white ring-2 ring-slate-900 shadow-sm"
                  : "bg-slate-50 border border-line text-ink hover:bg-slate-100"
              }`}
            >
              <p className="text-lg font-black">{totalScheduled}</p>
              <p className={`text-[10px] font-semibold ${activeTab === "all" ? "text-slate-300" : "text-ink-muted"}`}>
                All Scheduled
              </p>
            </Link>

            <Link
              href={buildFollowUpsUrl({ tab: "overdue", page: 1 })}
              className={`rounded-2xl px-3.5 py-2.5 text-center transition ${
                activeTab === "overdue"
                  ? "bg-rose-600 text-white ring-2 ring-rose-400 shadow-sm"
                  : "bg-rose-50 border border-rose-200 text-rose-800 hover:bg-rose-100"
              }`}
            >
              <p className="text-lg font-black">{overdueCount}</p>
              <p className={`text-[10px] font-semibold ${activeTab === "overdue" ? "text-rose-100" : "text-rose-700"}`}>
                🚨 Overdue
              </p>
            </Link>

            <Link
              href={buildFollowUpsUrl({ tab: "today", page: 1 })}
              className={`rounded-2xl px-3.5 py-2.5 text-center transition ${
                activeTab === "today"
                  ? "bg-amber-600 text-white ring-2 ring-amber-400 shadow-sm"
                  : "bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100"
              }`}
            >
              <p className="text-lg font-black">{todayCount}</p>
              <p className={`text-[10px] font-semibold ${activeTab === "today" ? "text-amber-100" : "text-amber-800"}`}>
                ⏰ Due Today
              </p>
            </Link>

            <Link
              href={buildFollowUpsUrl({ tab: "upcoming", page: 1 })}
              className={`rounded-2xl px-3.5 py-2.5 text-center transition ${
                activeTab === "upcoming"
                  ? "bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-sm"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              <p className="text-lg font-black">{upcomingCount}</p>
              <p className={`text-[10px] font-semibold ${activeTab === "upcoming" ? "text-emerald-100" : "text-emerald-800"}`}>
                📅 Upcoming
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* Filter Tabs Navigation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All Follow-ups", count: totalScheduled },
            { id: "overdue", label: "Overdue", count: overdueCount },
            { id: "today", label: "Due Today", count: todayCount },
            { id: "upcoming", label: "Upcoming", count: upcomingCount },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={buildFollowUpsUrl({ tab: tab.id, page: 1 })}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-white shadow-xs"
                    : "bg-white border border-line text-ink hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-ink-muted"
                  }`}
                >
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Live Search Form */}
        <form method="GET" action="/admin/follow-ups" className="flex items-center gap-2">
          {activeTab !== "all" && <input type="hidden" name="tab" value={activeTab} />}
          {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
          {resolvedParams.range && <input type="hidden" name="range" value={resolvedParams.range} />}
          <input
            type="text"
            name="search"
            defaultValue={resolvedParams.search || ""}
            placeholder="Search prospect or rep..."
            className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-56"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
          >
            Filter
          </button>
        </form>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            📅
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">
            {activeTab === "overdue"
              ? "No Overdue Follow-ups"
              : activeTab === "today"
              ? "No Follow-ups Due Today"
              : activeTab === "upcoming"
              ? "No Upcoming Follow-ups"
              : "No Follow-ups Scheduled Yet"}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {activeTab !== "all"
              ? "Try switching to the 'All Follow-ups' tab to see other scheduled records."
              : "Once a representative sets a follow-up date on a lead, it will appear here."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-3 px-4">Lead</th>
                  <th className="py-3 px-4">Representative</th>
                  <th className="py-3 px-4">Scheduled For</th>
                  <th className="py-3 px-4">Follow-up Iteration</th>
                  <th className="py-3 px-4">Logged At</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedSequence.map((log) => {
                  const isCurrent = log.lead.followUpAt?.getTime() === log.scheduledFor.getTime();
                  const isOverdue = isCurrent && log.scheduledFor < todayStart;
                  const isToday = isCurrent && log.scheduledFor >= todayStart && log.scheduledFor < todayEnd;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <Link href={`/admin/lead-history/${log.lead.id}`} className="font-bold text-ink hover:text-sky-700">
                          <ProtectedData text={log.lead.name || "Unnamed Prospect"} />
                        </Link>
                        <p className="font-mono text-[11px] text-ink-muted">
                          <ProtectedData text={log.lead.phoneNumber || "No phone"} />
                        </p>
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink">
                        {log.employee.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-ink">
                          {log.scheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <span className="block text-[10px] text-ink-muted">
                          {log.scheduledFor.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                          {log.sequence === 1 ? "1st" : log.sequence === 2 ? "2nd" : log.sequence === 3 ? "3rd" : `${log.sequence}th`} follow-up
                        </span>
                      </td>
                      <td className="py-3 px-4 text-ink-muted">
                        {log.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                      <td className="py-3 px-4">
                        {!isCurrent ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-faint">
                            Rescheduled
                          </span>
                        ) : isOverdue ? (
                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            Overdue
                          </span>
                        ) : isToday ? (
                          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Due Today
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Upcoming
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {paginatedSequence.map((log) => {
              const isCurrent = log.lead.followUpAt?.getTime() === log.scheduledFor.getTime();
              const isOverdue = isCurrent && log.scheduledFor < todayStart;
              const isToday = isCurrent && log.scheduledFor >= todayStart && log.scheduledFor < todayEnd;
              const cleanPhone = (log.lead.phoneNumber || "").replace(/\D/g, "");

              return (
                <div key={log.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-ink text-base">
                        <ProtectedData text={log.lead.name || "Unnamed Prospect"} />
                      </p>
                      <p className="font-mono text-xs text-ink-muted mt-0.5">
                        <ProtectedData text={log.lead.phoneNumber || "No phone"} />
                      </p>
                    </div>
                    <div>
                      {!isCurrent ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-faint">
                          Rescheduled
                        </span>
                      ) : isOverdue ? (
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                          Overdue
                        </span>
                      ) : isToday ? (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Due Today
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                      {log.sequence === 1 ? "1st" : log.sequence === 2 ? "2nd" : log.sequence === 3 ? "3rd" : `${log.sequence}th`} follow-up
                    </span>
                    <span className="text-ink-muted text-xs">
                      Rep: <strong className="text-ink">{log.employee.name}</strong>
                    </span>
                    <span className="text-ink-faint text-[11px]">
                      Scheduled: <strong>{log.scheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
                    </span>
                  </div>

                  {cleanPhone && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-line-soft">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 py-1.5 text-xs font-bold text-blue-700 active:bg-blue-100 transition"
                      >
                        <span>📞</span>
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 py-1.5 text-xs font-bold text-emerald-700 active:bg-emerald-100 transition"
                      >
                        <span>💬</span>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={LEADS_PER_PAGE}
            itemName="follow-ups"
            buildHref={(p) => buildFollowUpsUrl({ page: p })}
          />
        </div>
      )}
    </div>
  );
}
