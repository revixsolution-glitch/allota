import Link from "next/link";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { updateEmployeeLeadStatus } from "@/lib/admin-actions";
import { FollowUpPicker } from "@/components/FollowUpPicker";
import { LeadRemarksModal } from "@/components/LeadRemarksModal";
import { SourceBadge } from "@/components/SourceBadge";
import { GradientText } from "@/components/GradientText";
import { CLOSED_LEAD_STATUSES, startOfDay, endOfDay } from "@/lib/follow-up";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { PaginationBar } from "@/components/PaginationBar";
import { CategoryBadge } from "@/components/CategoryBadge";

export const dynamic = "force-dynamic";

interface EmployeeFollowUpsPageProps {
  searchParams?: Promise<{
    tab?: string;
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function EmployeeFollowUpsPage(props: EmployeeFollowUpsPageProps) {
  const session = await getSession();
  const employeeId = session?.employeeId;
  const activeCompanyId = getActiveCompanyId(session);

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

  const params = props.searchParams ? await props.searchParams : {};
  const activeTab = (params?.tab || "all").toLowerCase();
  const search = (params?.search || "").trim().toLowerCase();

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  const baseCompanyFilter = scopeToCompany(activeCompanyId);

  // 1. Fetch counts for all scheduled states
  const [employee, allScheduledLeads] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.lead.findMany({
      where: {
        assignedEmployeeId: employeeId,
        followUpAt: { not: null },
        status: { notIn: [...CLOSED_LEAD_STATUSES] },
        ...baseCompanyFilter,
      },
      include: {
        _count: { select: { calls: true } },
        calls: {
          select: {
            id: true,
            aiSummary: true,
            transcript: true,
            occurredAt: true,
            durationSec: true,
            missed: true,
            recordingUrl: true,
          },
          orderBy: { occurredAt: "desc" },
        },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { followUpAt: "asc" },
    }),
  ]);

  const overdueList = allScheduledLeads.filter((l) => l.followUpAt && l.followUpAt < todayStart);
  const todayList = allScheduledLeads.filter(
    (l) => l.followUpAt && l.followUpAt >= todayStart && l.followUpAt < todayEnd
  );
  const upcomingList = allScheduledLeads.filter((l) => l.followUpAt && l.followUpAt >= todayEnd);

  const overdueCount = overdueList.length;
  const todayCount = todayList.length;
  const upcomingCount = upcomingList.length;
  const totalCount = allScheduledLeads.length;

  // 2. Select leads based on active tab
  let visibleLeads = allScheduledLeads;
  if (activeTab === "overdue") {
    visibleLeads = overdueList;
  } else if (activeTab === "today") {
    visibleLeads = todayList;
  } else if (activeTab === "upcoming") {
    visibleLeads = upcomingList;
  }

  // 3. Apply search filter if query is present
  if (search) {
    visibleLeads = visibleLeads.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const phone = (l.phoneNumber || "").toLowerCase();
      const details = (l.inquiryDetails || "").toLowerCase();
      const city = (l.city || "").toLowerCase();
      return (
        name.includes(search) ||
        phone.includes(search) ||
        details.includes(search) ||
        city.includes(search)
      );
    });
  }

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(params?.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedLeads = visibleLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const buildEmployeeFollowUpsUrl = (o: { tab?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const t = o.tab !== undefined ? o.tab : activeTab;
    const p = o.page !== undefined ? o.page : 1;
    if (t && t !== "all") sp.set("tab", t);
    if (params?.search) sp.set("search", params.search);
    if (params?.range) sp.set("range", params.range);
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/employee/follow-ups?${qs}` : "/employee/follow-ups";
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-3xl p-5 sm:p-7 neo-panel border-t-2 border-t-amber-500/80 bg-white shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Representative Follow-up Desk
              </span>
              <span className="text-xs text-ink-faint">
                Representative: <strong className="text-ink">{employee?.name}</strong>
              </span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              My <GradientText>Follow-ups</GradientText>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted">
              Scheduled client touchpoints, callbacks, and order closures. Never miss a customer commitment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/employee/leads"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-ink neo-button hover:border-primary/40 transition"
            >
              📋 All My Leads &rarr;
            </Link>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href={buildEmployeeFollowUpsUrl({ tab: "all" })}
            className={`rounded-2xl p-4 transition-all border ${
              activeTab === "all"
                ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10"
                : "bg-slate-50 border-line hover:border-slate-300 text-ink"
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === "all" ? "text-slate-300" : "text-ink-faint"}`}>
              Total Scheduled
            </p>
            <p className="mt-1 text-2xl font-black">{totalCount}</p>
            <p className={`mt-0.5 text-[11px] ${activeTab === "all" ? "text-slate-300" : "text-ink-muted"}`}>
              Active callbacks
            </p>
          </Link>

          <Link
            href={buildEmployeeFollowUpsUrl({ tab: "today" })}
            className={`rounded-2xl p-4 transition-all border ${
              activeTab === "today"
                ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-600/10"
                : "bg-amber-50/70 border-amber-200/80 hover:border-amber-300 text-ink"
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === "today" ? "text-amber-100" : "text-amber-800"}`}>
              ⏰ Due Today
            </p>
            <p className={`mt-1 text-2xl font-black ${activeTab === "today" ? "text-white" : "text-amber-800"}`}>
              {todayCount}
            </p>
            <p className={`mt-0.5 text-[11px] ${activeTab === "today" ? "text-amber-100" : "text-amber-700"}`}>
              Today&apos;s priority
            </p>
          </Link>

          <Link
            href={buildEmployeeFollowUpsUrl({ tab: "overdue" })}
            className={`rounded-2xl p-4 transition-all border ${
              activeTab === "overdue"
                ? "bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-600/10"
                : "bg-rose-50/70 border-rose-200/80 hover:border-rose-300 text-ink"
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === "overdue" ? "text-rose-100" : "text-rose-800"}`}>
              🚨 Overdue
            </p>
            <p className={`mt-1 text-2xl font-black ${activeTab === "overdue" ? "text-white" : "text-rose-800"}`}>
              {overdueCount}
            </p>
            <p className={`mt-0.5 text-[11px] ${activeTab === "overdue" ? "text-rose-100" : "text-rose-700"}`}>
              Past scheduled date
            </p>
          </Link>

          <Link
            href={buildEmployeeFollowUpsUrl({ tab: "upcoming" })}
            className={`rounded-2xl p-4 transition-all border ${
              activeTab === "upcoming"
                ? "bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-600/10"
                : "bg-sky-50/70 border-sky-200/80 hover:border-sky-300 text-ink"
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === "upcoming" ? "text-sky-100" : "text-sky-800"}`}>
              📅 Upcoming
            </p>
            <p className={`mt-1 text-2xl font-black ${activeTab === "upcoming" ? "text-white" : "text-sky-800"}`}>
              {upcomingCount}
            </p>
            <p className={`mt-0.5 text-[11px] ${activeTab === "upcoming" ? "text-sky-100" : "text-sky-700"}`}>
              Future callbacks
            </p>
          </Link>
        </div>
      </section>

      {/* Filter Tabs & Search Controls */}
      <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-line-soft overflow-x-auto">
          {[
            { id: "all", label: "All Scheduled", count: totalCount },
            { id: "today", label: "⏰ Today", count: todayCount },
            { id: "overdue", label: "🚨 Overdue", count: overdueCount },
            { id: "upcoming", label: "📅 Upcoming", count: upcomingCount },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/employee/follow-ups?tab=${tab.id}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  isActive
                    ? "bg-white text-ink shadow-xs border border-line"
                    : "text-ink-muted hover:text-ink hover:bg-slate-200/50"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-primary/10 text-primary font-black" : "bg-slate-200 text-slate-600"}`}>
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Search Bar */}
        <form method="GET" action="/employee/follow-ups" className="relative flex-1 sm:max-w-xs">
          <input type="hidden" name="tab" value={activeTab} />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search by name, phone, salt..."
            className="w-full rounded-2xl border border-line bg-white pl-9 pr-4 py-2 text-xs font-semibold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
          />
          <span className="absolute left-3 top-2.5 text-xs text-ink-faint">🔍</span>
        </form>
      </section>

      {/* Follow-up Leads List */}
      {visibleLeads.length === 0 ? (
        <div className="rounded-3xl p-12 text-center neo-panel bg-white border border-line space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl border border-amber-200">
            ⏰
          </div>
          <h3 className="text-base font-bold text-ink">No Follow-ups in this Category</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {activeTab === "today"
              ? "Awesome! You have cleared all follow-ups due today."
              : activeTab === "overdue"
              ? "Great job! You have zero overdue follow-up calls."
              : "No pending follow-ups found for the selected filter."}
          </p>
          <div className="pt-2">
            <Link
              href="/employee/leads"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition"
            >
              Go to Allotted Leads to Schedule Follow-up
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden shadow-xs">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto crm-table-container w-full">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3.5 py-3 w-[22%] min-w-[190px] whitespace-nowrap">Prospect &amp; Contact</th>
                  <th className="px-2 py-3 w-[10%] min-w-[85px] text-center whitespace-nowrap">Category</th>
                  <th className="px-2 py-3 w-[12%] min-w-[110px] text-center whitespace-nowrap">Platform</th>
                  <th className="px-3 py-3 w-[22%] min-w-[180px] whitespace-nowrap">Scheduled Date</th>
                  <th className="px-2 py-3 w-[11%] min-w-[100px] text-center whitespace-nowrap">Remarks</th>
                  <th className="px-2 py-3 w-[11%] min-w-[100px] whitespace-nowrap">Status</th>
                  <th className="px-3.5 py-3 w-[12%] min-w-[110px] text-right whitespace-nowrap">Instant Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedLeads.map((lead) => {
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const isThirdParty = lead.division === "THIRD_PARTY";

                  const targetDate = lead.followUpAt ? new Date(lead.followUpAt) : null;
                  const isOverdue = targetDate ? targetDate < todayStart : false;
                  const isToday = targetDate ? targetDate >= todayStart && targetDate < todayEnd : false;

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Prospect */}
                      <td className="px-3.5 py-3.5 w-[22%] min-w-[190px]">
                        <p className="font-bold text-ink text-sm">{lead.name}</p>
                        <p className="font-mono text-ink-muted text-xs mt-0.5">
                          {lead.phoneNumber || "No phone recorded"}
                        </p>
                        {lead.city && (
                          <p className="text-[10px] text-ink-faint mt-0.5">
                            📍 {lead.city}{lead.state ? `, ${lead.state}` : ""}
                          </p>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-2 py-3.5 w-[10%] min-w-[85px] text-center whitespace-nowrap">
                        <CategoryBadge division={lead.division} />
                      </td>

                      {/* Channel / Source with Official Brand Logo */}
                      <td className="px-2 py-3.5 w-[12%] min-w-[110px] text-center whitespace-nowrap">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      {/* Scheduled Date & Timing Badge */}
                      <td className="px-3 py-3.5 w-[22%] min-w-[180px]">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                              isOverdue
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : isToday
                                ? "bg-amber-50 text-amber-900 border-amber-200"
                                : "bg-sky-50 text-sky-800 border-sky-200"
                            }`}
                          >
                            <span>{isOverdue ? "🚨" : isToday ? "⏰" : "📅"}</span>
                            <span>
                              {isOverdue
                                ? `Overdue • ${targetDate?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                                : isToday
                                ? "Due Today"
                                : targetDate?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </span>

                          <div>
                            <FollowUpPicker
                              leadId={lead.id}
                              followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                              size="sm"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Remarks & Notes Modal */}
                      <td className="px-2 py-3.5 w-[11%] min-w-[100px] text-center whitespace-nowrap">
                        <LeadRemarksModal
                          leadId={lead.id}
                          leadName={lead.name ?? "Unnamed Prospect"}
                          leadPhone={lead.phoneNumber ?? ""}
                          leadStatus={lead.status}
                          followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                          remarks={lead.remarks.map((r) => ({
                            id: r.id,
                            remark: r.remark,
                            createdAt: r.createdAt.toISOString(),
                            employeeName: r.employee.name,
                          }))}
                          callSummaries={lead.calls
                            .filter((c) => (c.aiSummary && c.aiSummary.trim().length > 0) || c.transcript)
                            .map((c) => ({
                              id: c.id,
                              aiSummary: c.aiSummary,
                              transcript: c.transcript,
                              occurredAt: c.occurredAt.toISOString(),
                              durationSec: c.durationSec,
                              missed: c.missed,
                              recordingUrl: c.recordingUrl,
                            }))}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-2 py-3.5 w-[11%] min-w-[100px] whitespace-nowrap">
                        <form action={updateEmployeeLeadStatus} className="flex items-center gap-1.5">
                          <input type="hidden" name="leadId" value={lead.id} />
                          <select
                            name="status"
                            defaultValue={lead.status}
                            className="h-7 rounded-lg border border-line bg-white px-1.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value={LeadStatus.ASSIGNED}>Assigned</option>
                            <option value={LeadStatus.CONTACTED}>Contacted</option>
                            <option value={LeadStatus.INTERESTED}>Interested</option>
                            <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                            <option value={LeadStatus.CONVERTED}>Converted ✓</option>
                          </select>
                          <button
                            type="submit"
                            className="h-7 rounded-lg px-2 text-[10px] font-bold text-ink neo-button hover:text-primary transition"
                          >
                            Save
                          </button>
                        </form>
                      </td>

                      {/* Direct 1-Tap Actions */}
                      <td className="px-3.5 py-3.5 w-[12%] min-w-[110px] text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95"
                                title="Call representative directly"
                              >
                                📞 Call
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition active:scale-95"
                                title="Open WhatsApp chat"
                              >
                                💬 WhatsApp
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-line">
            {paginatedLeads.map((lead) => {
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const isThirdParty = lead.division === "THIRD_PARTY";

              const targetDate = lead.followUpAt ? new Date(lead.followUpAt) : null;
              const isOverdue = targetDate ? targetDate < todayStart : false;
              const isToday = targetDate ? targetDate >= todayStart && targetDate < todayEnd : false;

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-ink text-base">{lead.name}</h3>
                      <p className="font-mono text-ink-muted text-xs">{lead.phoneNumber}</p>
                    </div>

                    <CategoryBadge division={lead.division} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${
                        isOverdue
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : isToday
                          ? "bg-amber-50 text-amber-900 border-amber-200"
                          : "bg-sky-50 text-sky-800 border-sky-200"
                      }`}
                    >
                      <span>{isOverdue ? "🚨 Overdue" : isToday ? "⏰ Due Today" : "📅 Scheduled"}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <div className="flex items-center gap-2">
                      {cleanPhone && (
                        <>
                          <a
                            href={`tel:${cleanPhone}`}
                            className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700"
                          >
                            📞 Call
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700"
                          >
                            💬 WhatsApp
                          </a>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <LeadRemarksModal
                        leadId={lead.id}
                        leadName={lead.name ?? "Unnamed Prospect"}
                        leadPhone={lead.phoneNumber ?? ""}
                        leadStatus={lead.status}
                        followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                        remarks={lead.remarks.map((r) => ({
                          id: r.id,
                          remark: r.remark,
                          createdAt: r.createdAt.toISOString(),
                          employeeName: r.employee.name,
                        }))}
                        callSummaries={lead.calls
                          .filter((c) => (c.aiSummary && c.aiSummary.trim().length > 0) || c.transcript)
                          .map((c) => ({
                            id: c.id,
                            aiSummary: c.aiSummary,
                            transcript: c.transcript,
                            occurredAt: c.occurredAt.toISOString(),
                            durationSec: c.durationSec,
                            missed: c.missed,
                            recordingUrl: c.recordingUrl,
                          }))}
                      />
                      <FollowUpPicker
                        leadId={lead.id}
                        followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                        size="sm"
                      />
                    </div>
                  </div>
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
            buildHref={(p) => buildEmployeeFollowUpsUrl({ page: p })}
          />
        </div>
      )}
    </div>
  );
}
