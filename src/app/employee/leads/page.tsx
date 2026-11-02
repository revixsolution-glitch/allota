import Link from "next/link";
import { Fragment } from "react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { addLeadRemark } from "@/lib/admin-actions";
import { FollowUpPicker } from "@/components/FollowUpPicker";
import { LeadStatusToggle } from "@/components/LeadStatusToggle";
import { formatLeadDateTime } from "@/lib/date-format";

import { parseDashboardDateFilter } from "@/lib/date-filters";
import { CLOSED_LEAD_STATUSES, getFollowUpState } from "@/lib/follow-up";
import { GradientText } from "@/components/GradientText";
import { SourceBadge } from "@/components/SourceBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";
import { LeadRemarksModal } from "@/components/LeadRemarksModal";
import { CategoryBadge } from "@/components/CategoryBadge";

export default async function EmployeeLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    division?: string;
    followUp?: string;
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  const employeeId = session?.employeeId;

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

  const params = await searchParams;
  const selectedDivision = params?.division || "ALL";
  const search = (params?.search || "").trim().toLowerCase();
  const followUpFilter = ["due", "overdue", "today", "upcoming", "fresh"].includes(params?.followUp || "")
    ? (params?.followUp as "due" | "overdue" | "today" | "upcoming" | "fresh")
    : "all";

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  const where: Record<string, any> = {
    assignedEmployeeId: employeeId,
    status: { notIn: [LeadStatus.CONVERTED, LeadStatus.NOT_INTERESTED] },
  };

  if (selectedDivision === "PCD_FRANCHISE" || selectedDivision === "THIRD_PARTY") {
    where.division = selectedDivision;
  }

  if (params?.range && params.range !== "all_time") {
    if (dateFilter.start && dateFilter.end) {
      where.createdAt = { gte: dateFilter.start, lte: dateFilter.end };
    } else if (dateFilter.start) {
      where.createdAt = { gte: dateFilter.start };
    }
  }

  const [leads, employee, divisionCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
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
        reassignmentLogs: {
          take: 1,
          orderBy: { reassignedAt: "desc" },
        },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.lead.groupBy({
      by: ["division"],
      where: {
        assignedEmployeeId: employeeId,
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.NOT_INTERESTED] },
      },
      _count: { _all: true },
    }),
  ]);

  const pcdCount =
    divisionCounts.find((d) => d.division === "PCD_FRANCHISE")?._count._all || 0;
  const tpCount =
    divisionCounts.find((d) => d.division === "THIRD_PARTY")?._count._all || 0;
  const totalLeads = pcdCount + tpCount;

  // Filter leads if search query present
  const searchedLeads = search
    ? leads.filter((l) => {
        const name = (l.name || "").toLowerCase();
        const phone = (l.phoneNumber || "").toLowerCase();
        const city = (l.city || "").toLowerCase();
        const state = (l.state || "").toLowerCase();
        const details = (l.inquiryDetails || "").toLowerCase();
        return (
          name.includes(search) ||
          phone.includes(search) ||
          city.includes(search) ||
          state.includes(search) ||
          details.includes(search)
        );
      })
    : leads;

  // Fresh Uncontacted Leads criteria:
  // Status NEW or ASSIGNED, zero remarks, no scheduled follow-up date, and zero calls
  const isFreshLead = (l: (typeof leads)[number]) =>
    (l.status === "NEW" || l.status === "ASSIGNED") &&
    l.remarks.length === 0 &&
    !l.followUpAt &&
    (l._count.calls || 0) === 0;

  const freshCount = leads.filter(isFreshLead).length;

  // Follow-up buckets (dead / converted leads never count as due)
  const now = new Date();
  const stateOf = (l: (typeof leads)[number]) =>
    l.followUpAt && !(CLOSED_LEAD_STATUSES as readonly string[]).includes(l.status)
      ? getFollowUpState(l.followUpAt, now)
      : null;
  const overdueCount = leads.filter((l) => stateOf(l) === "overdue").length;
  const todayCount = leads.filter((l) => stateOf(l) === "today").length;
  const upcomingCount = leads.filter((l) => stateOf(l) === "upcoming").length;

  const followUpMatches = (l: (typeof leads)[number]) => {
    if (followUpFilter === "fresh") return isFreshLead(l);
    if (followUpFilter === "all") return true;
    const st = stateOf(l);
    if (followUpFilter === "due") return st === "overdue" || st === "today";
    return st === followUpFilter;
  };

  // SOLID ORDERING:
  // 1. Fresh uncontacted leads ALWAYS stay on top so reps deal with fresh leads first.
  // 2. Contacted / pipeline leads appear below the separator.
  const filteredLeads = searchedLeads
    .filter(followUpMatches)
    .sort((a, b) => {
      const aFresh = isFreshLead(a);
      const bFresh = isFreshLead(b);
      // Fresh uncontacted leads always float to the top
      if (aFresh !== bFresh) return aFresh ? -1 : 1;
      if (aFresh && bFresh) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      // For contacted / pipeline leads:
      const da = stateOf(a);
      const db = stateOf(b);
      const aDue = da === "overdue" || da === "today";
      const bDue = db === "overdue" || db === "today";
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (aDue && bDue) return (a.followUpAt as Date).getTime() - (b.followUpAt as Date).getTime();
      if (followUpFilter === "upcoming") return (a.followUpAt as Date).getTime() - (b.followUpAt as Date).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(params?.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalFilteredLeads = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredLeads / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const buildUrl = (o: { division?: string; followUp?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const d = o.division ?? selectedDivision;
    const f = o.followUp ?? followUpFilter;
    const p = o.page !== undefined ? o.page : 1;
    if (d && d !== "ALL") sp.set("division", d);
    if (f && f !== "all") sp.set("followUp", f);
    if (search) sp.set("search", params?.search || "");
    if (params?.range) sp.set("range", params.range);
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/employee/leads?${qs}` : "/employee/leads";
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-primary/70 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Assigned Inquiries Desk
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">
              My Allotted <GradientText>Leads</GradientText> ({totalLeads})
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Representative: <strong className="text-ink">{employee?.name}</strong> • Phone: {employee?.phoneNumber}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/employee"
              className="rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-ink-muted hover:text-ink transition"
            >
              &larr; Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Division Filter Chips & Search Bar */}
        <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildUrl({ division: "ALL" })}
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
                selectedDivision === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-canvas text-ink-muted hover:text-ink border border-line"
              }`}
            >
              All Inquiries ({totalLeads})
            </Link>
            <Link
              href={buildUrl({ division: "PCD_FRANCHISE" })}
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                selectedDivision === "PCD_FRANCHISE"
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200"
              }`}
            >
              <span>🏢</span>
              <span>PCD Franchise ({pcdCount})</span>
            </Link>
            <Link
              href={buildUrl({ division: "THIRD_PARTY" })}
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                selectedDivision === "THIRD_PARTY"
                  ? "bg-purple-700 text-white shadow-xs"
                  : "bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200"
              }`}
            >
              <span>🏭</span>
              <span>Third-Party ({tpCount})</span>
            </Link>
          </div>

          {/* Follow-up reminders */}
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3 sm:order-last sm:basis-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-faint">Follow-ups</span>
            {(
              [
                { key: "all", label: "All Pipeline", count: null, tone: "border-line bg-canvas text-ink-muted", on: "bg-slate-800 text-white border-slate-800" },
                { key: "fresh", label: "✨ Fresh Leads", count: freshCount, tone: "border-emerald-300 bg-emerald-50 text-emerald-800 font-black", on: "bg-emerald-600 text-white border-emerald-600 shadow-2xs" },
                { key: "due", label: "Due now", count: overdueCount + todayCount, tone: "border-sky-200 bg-sky-50 text-sky-800", on: "bg-sky-700 text-white border-sky-700" },
                { key: "overdue", label: "Overdue", count: overdueCount, tone: "border-rose-200 bg-rose-50 text-rose-700", on: "bg-rose-600 text-white border-rose-600" },
                { key: "today", label: "Today", count: todayCount, tone: "border-amber-200 bg-amber-50 text-amber-800", on: "bg-amber-500 text-white border-amber-500" },
                { key: "upcoming", label: "Upcoming", count: upcomingCount, tone: "border-emerald-200 bg-emerald-50 text-emerald-800", on: "bg-emerald-600 text-white border-emerald-600" },
              ] as const
            ).map((t) => (
              <Link
                key={t.key}
                href={buildUrl({ followUp: t.key })}
                className={`rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                  followUpFilter === t.key ? t.on : t.tone
                }`}
              >
                {t.label}
                {t.count !== null && ` (${t.count})`}
              </Link>
            ))}
          </div>

          {/* Search Bar */}
          <form className="flex items-center gap-2 w-full sm:w-auto">
            {selectedDivision !== "ALL" && (
              <input type="hidden" name="division" value={selectedDivision} />
            )}
            {followUpFilter !== "all" && <input type="hidden" name="followUp" value={followUpFilter} />}
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by prospect, phone, city..."
              className="h-10 flex-1 sm:w-64 rounded-xl border border-line bg-canvas px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-3.5 text-xs font-bold text-white hover:bg-primary-strong transition shrink-0 cursor-pointer"
            >
              Search
            </button>
            {search && (
              <Link
                href={
                  selectedDivision !== "ALL"
                    ? `/employee/leads?division=${selectedDivision}`
                    : "/employee/leads"
                }
                className="text-xs font-bold text-ink-faint hover:text-ink shrink-0"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </section>

      {/* Leads Container */}
      {filteredLeads.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            📋
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Leads Found</h3>
          <p className="mt-1 text-xs text-ink-muted">
            {search
              ? "No inquiries matched your search query."
              : "Zero leads are currently allotted to your queue. New batches assigned by Admin will show here immediately."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto crm-table-container w-full">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-3.5 py-3 w-[26%] min-w-[190px] whitespace-nowrap">Prospect &amp; Contact</th>
                  <th className="px-3 py-3 w-[13%] min-w-[110px] whitespace-nowrap">Category</th>
                  <th className="px-3 py-3 w-[15%] min-w-[120px] whitespace-nowrap">Platform</th>
                  <th className="px-3 py-3 w-[18%] min-w-[150px] whitespace-nowrap">Follow Up</th>
                  <th className="px-3 py-3 w-[13%] min-w-[95px] whitespace-nowrap">Remarks</th>
                  <th className="px-3.5 py-3 w-[15%] min-w-[115px] text-right whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedLeads.map((lead, idx) => {
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const isThirdParty = lead.division === "THIRD_PARTY";
                  const isCurrentFresh = isFreshLead(lead);
                  const prevLead = idx > 0 ? paginatedLeads[idx - 1] : null;
                  const isTransitionToPipeline = prevLead && isFreshLead(prevLead) && !isCurrentFresh;
                  const isFirstLead = idx === 0;

                  return (
                    <Fragment key={lead.id}>
                      {isFirstLead && isCurrentFresh && (
                        <tr className="bg-transparent">
                          <td colSpan={6} className="px-3.5 py-2">
                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-300 to-emerald-200" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 select-none flex items-center gap-1.5 whitespace-nowrap">
                                <span>✨</span>
                                <span>Fresh Leads ({freshCount})</span>
                              </span>
                              <div className="h-px flex-1 bg-gradient-to-r from-emerald-200 via-emerald-300 to-transparent" />
                            </div>
                          </td>
                        </tr>
                      )}
                      {isTransitionToPipeline && (
                        <tr className="bg-transparent">
                          <td colSpan={6} className="px-3.5 py-2">
                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-slate-200" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 select-none flex items-center gap-1.5 whitespace-nowrap">
                                <span>Follow-up Pipeline</span>
                              </span>
                              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 via-slate-300 to-transparent" />
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50/70 transition">
                        {/* Prospect & Contact */}
                        <td className="px-3.5 py-3 w-[26%] min-w-[190px] relative">
                          {/* Floating small NEW tag on top-left of lead */}
                          {isCurrentFresh && (
                            <span
                              title="Fresh uncontacted lead"
                              className="absolute top-1.5 left-2 inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0 text-[8px] font-black uppercase tracking-wider shadow-2xs select-none pointer-events-none z-10"
                            >
                              <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                              <span>NEW</span>
                            </span>
                          )}
                          <div className={`font-extrabold text-ink text-sm min-w-0 ${isCurrentFresh ? "pt-3.5" : ""}`}>
                            <span className="truncate block">
                              <ProtectedData text={lead.name || "Anonymous Prospect"} />
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-muted whitespace-nowrap">
                            <ProtectedData text={lead.phoneNumber || "No Phone"} />
                            {cleanPhone && (
                              <>
                                <a
                                  href={`tel:${cleanPhone}`}
                                  title="Click to Call"
                                  className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition shrink-0"
                                >
                                  📞
                                </a>
                                <a
                                  href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open WhatsApp Chat"
                                  className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shrink-0"
                                >
                                  💬
                                </a>
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted whitespace-nowrap">
                            <span className="text-xs">📅</span>
                            <span>{formatLeadDateTime(lead.createdAt)}</span>
                          </div>
                          {lead.reassignmentLogs && lead.reassignmentLogs.length > 0 && (
                            <p className="text-[10px] text-teal-700 font-bold mt-1 truncate">
                              ⚡ Allotted by Admin ({lead.reassignmentLogs[0].reason || "Direct Allotment"})
                            </p>
                          )}
                        </td>

                      {/* Division Category */}
                      <td className="px-3 py-3 w-[13%] min-w-[110px] whitespace-nowrap">
                        <CategoryBadge division={lead.division} />
                      </td>

                      {/* Channel / Source */}
                      <td className="px-3 py-3 w-[15%] min-w-[120px]">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      {/* Follow Up */}
                      <td className="px-3 py-3 w-[18%] min-w-[150px]">
                        <FollowUpPicker
                          leadId={lead.id}
                          followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                          size="sm"
                        />
                      </td>

                      {/* Remarks (Global Unified Modal with AI Summaries) */}
                      <td className="px-3 py-3 w-[13%] min-w-[95px] whitespace-nowrap">
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

                      {/* Status: Active / Converted / Dead */}
                      <td className="px-3.5 py-3 w-[15%] min-w-[115px] text-right whitespace-nowrap">
                        <div className="inline-flex justify-end">
                          <LeadStatusToggle leadId={lead.id} status={lead.status} deadReason={lead.deadReason} />
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {paginatedLeads.map((lead, idx) => {
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const isThirdParty = lead.division === "THIRD_PARTY";
              const isCurrentFresh = isFreshLead(lead);
              const prevLead = idx > 0 ? paginatedLeads[idx - 1] : null;
              const isTransitionToPipeline = prevLead && isFreshLead(prevLead) && !isCurrentFresh;
              const isFirstLead = idx === 0;

              return (
                <Fragment key={lead.id}>
                  {isFirstLead && isCurrentFresh && (
                    <div className="px-4 py-2 flex items-center gap-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-300 to-emerald-200" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 select-none flex items-center gap-1.5 whitespace-nowrap">
                        <span>✨</span>
                        <span>Fresh Leads ({freshCount})</span>
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-emerald-200 via-emerald-300 to-transparent" />
                    </div>
                  )}
                  {isTransitionToPipeline && (
                    <div className="px-4 py-2 flex items-center gap-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-slate-200" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 select-none flex items-center gap-1.5 whitespace-nowrap">
                        <span>Follow-up Pipeline</span>
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-slate-200 via-slate-300 to-transparent" />
                    </div>
                  )}
                  <div className="p-4 space-y-3.5 transition rounded-2xl mx-1.5 my-1.5 bg-white border border-line relative">
                    {/* Floating small NEW tag on mobile card */}
                    {isCurrentFresh && (
                      <span
                        title="Fresh uncontacted lead"
                        className="absolute top-2 left-3 inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0 text-[8px] font-black uppercase tracking-wider shadow-2xs select-none pointer-events-none"
                      >
                        <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                        <span>NEW</span>
                      </span>
                    )}
                    {/* Prospect Header */}
                    <div className={`flex items-start justify-between gap-2 ${isCurrentFresh ? "pt-2" : ""}`}>
                      <div>
                        <h3 className="font-extrabold text-ink text-base">
                          <ProtectedData text={lead.name || "Anonymous Prospect"} />
                        </h3>
                        <div className="font-mono text-ink-muted text-xs mt-0.5">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-medium text-ink-muted mt-1">
                          <span>📅</span>
                          <span>{formatLeadDateTime(lead.createdAt)}</span>
                        </div>
                      </div>
                      <CategoryBadge division={lead.division} />
                    </div>

                  {/* Badges strip: Source & Location */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                    {lead.city && (
                      <span className="text-ink-muted text-xs">
                        📍 {lead.city}{lead.state ? `, ${lead.state}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Direct 1-tap dialers */}
                  {cleanPhone && (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 py-2 text-xs font-bold text-blue-700 active:bg-blue-200 transition"
                      >
                        <span>📞</span>
                        <span>Call Direct</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 py-2 text-xs font-bold text-emerald-700 active:bg-emerald-200 transition"
                      >
                        <span>💬</span>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}

                  {/* Follow Up + Status */}
                  <div className="flex items-start justify-between gap-3 pt-2 border-t border-line-soft">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                        Follow Up
                      </p>
                      <FollowUpPicker
                        leadId={lead.id}
                        followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                      />
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                        Status
                      </p>
                      <LeadStatusToggle
                        leadId={lead.id}
                        status={lead.status}
                        isDead={lead.status === LeadStatus.NOT_INTERESTED}
                        deadReason={lead.deadReason}
                      />
                    </div>
                  </div>

                  {/* Unified Remarks Modal */}
                  <div className="pt-2 border-t border-line-soft">
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
                  </div>
                </div>
              </Fragment>
              );
            })}
          </div>

          {/* Pagination Footer */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalFilteredLeads}
            pageSize={LEADS_PER_PAGE}
            itemName="leads"
            buildHref={(p) => buildUrl({ page: p })}
          />
        </div>
      )}
    </div>
  );
}
