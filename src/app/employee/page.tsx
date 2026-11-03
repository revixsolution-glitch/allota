import Link from "next/link";
import { Fragment } from "react";
import { getSession } from "@/lib/auth";
import { addLeadRemark, completeFollowupTask, updateEmployeeLeadStatus } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { MissedCallAlertButton } from "@/components/MissedCallAlertButton";
import { FollowUpPicker } from "@/components/FollowUpPicker";
import { LeadStatusToggle } from "@/components/LeadStatusToggle";
import { formatLeadDateTime } from "@/lib/date-format";

import { parseDashboardDateFilter } from "@/lib/date-filters";
import { CLOSED_LEAD_STATUSES, endOfDay, startOfDay } from "@/lib/follow-up";
import { GradientText } from "@/components/GradientText";
import { SourceBadge } from "@/components/SourceBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { WhatsAppCompanionSection } from "@/components/WhatsAppCompanionSection";
import { CategoryBadge } from "@/components/CategoryBadge";
import { LeadRemarksModal } from "@/components/LeadRemarksModal";

interface EmployeeDashboardPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function EmployeeDashboardPage(props: EmployeeDashboardPageProps) {
  const session = await getSession();
  const employeeId = session?.employeeId;

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

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

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(searchParams.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const [
    employee,
    clientCount,
    allLeads,
    divisionStats,
    callsToday,
    totalCallsCount,
    allTimeCallsCount,
    callsPickedCount,
    callsMissedCount,
    missedCallsQueue,
    company,
    pendingTasks,
    recentAllotments,
    overdueFollowUps,
    todayFollowUps,
    assignedLeadsCount,
    periodNewLeads,
  ] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.client.count({ where: { assignedEmployeeId: employeeId } }),
    prisma.lead.findMany({
      where: {
        assignedEmployeeId: employeeId,
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.NOT_INTERESTED] },
      },
      include: {
        _count: { select: { calls: true } },
        reassignmentLogs: { take: 1, orderBy: { reassignedAt: "desc" } },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
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
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.groupBy({
      by: ["division"],
      where: {
        assignedEmployeeId: employeeId,
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.NOT_INTERESTED] },
      },
      _count: { _all: true },
    }),
    prisma.call.count({
      where: {
        employeeId,
        ...(dateFilter.preset !== "all_time"
          ? callDateFilter
          : { occurredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      },
    }),
    prisma.call.count({
      where: {
        employeeId,
        ...callDateFilter,
      },
    }),
    prisma.call.count({
      where: {
        employeeId,
      },
    }),
    prisma.call.count({
      where: {
        employeeId,
        missed: false,
        ...callDateFilter,
      },
    }),
    prisma.call.count({
      where: {
        employeeId,
        missed: true,
        ...callDateFilter,
      },
    }),
    prisma.call.findMany({
      where: {
        employeeId,
        missed: true,
        whatsappSent: false,
        ...callDateFilter,
      },
      include: {
        lead: true,
        client: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 4,
    }),
    prisma.company.findFirst({
      where: { employees: { some: { id: employeeId } } },
      select: { id: true, name: true, slug: true },
    }),
    prisma.followupTask.findMany({
      where: {
        assignedEmployeeId: employeeId,
        status: "PENDING",
      },
      include: {
        client: {
          include: { territory: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Check if any leads were allotted or reassigned to this employee in last 7 days
    prisma.leadReassignmentLog.findMany({
      where: { toEmployeeId: employeeId },
      include: { lead: true },
      orderBy: { reassignedAt: "desc" },
      take: 3,
    }),
    prisma.lead.count({
      where: {
        assignedEmployeeId: employeeId,
        followUpAt: { lt: startOfDay(new Date()) },
        status: { notIn: [...CLOSED_LEAD_STATUSES] },
      },
    }),
    prisma.lead.count({
      where: {
        assignedEmployeeId: employeeId,
        followUpAt: { gte: startOfDay(new Date()), lt: endOfDay(new Date()) },
        status: { notIn: [...CLOSED_LEAD_STATUSES] },
      },
    }),
    prisma.lead.count({
      where: {
        assignedEmployeeId: employeeId,
        status: { notIn: [LeadStatus.CONVERTED, LeadStatus.NOT_INTERESTED] },
      },
    }),
    dateFilter.start
      ? prisma.lead.count({
          where: {
            assignedEmployeeId: employeeId,
            ...leadDateFilter,
          },
        })
      : Promise.resolve(null),
  ]);

  // Fresh Uncontacted Leads:
  // Status NEW or ASSIGNED, zero remarks, no scheduled follow-up date, and zero calls
  const isFreshLead = (l: (typeof allLeads)[number]) =>
    (l.status === "NEW" || l.status === "ASSIGNED") &&
    l.remarks.length === 0 &&
    !l.followUpAt &&
    (l._count?.calls || 0) === 0;

  const freshCount = allLeads.filter(isFreshLead).length;

  // Solid ordering: Fresh uncontacted leads always float to the top
  const sortedLeads = [...allLeads].sort((a, b) => {
    const aFresh = isFreshLead(a);
    const bFresh = isFreshLead(b);
    if (aFresh !== bFresh) return aFresh ? -1 : 1;
    if (aFresh && bFresh) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const totalLeadPages = Math.max(1, Math.ceil(sortedLeads.length / LEADS_PER_PAGE));
  const currentLeadPage = Math.min(requestedPage, totalLeadPages);
  const leads = sortedLeads.slice((currentLeadPage - 1) * LEADS_PER_PAGE, currentLeadPage * LEADS_PER_PAGE);

  const buildDashboardUrl = (p: number) => {
    const sp = new URLSearchParams();
    if (searchParams.range) sp.set("range", searchParams.range);
    if (searchParams.from) sp.set("from", searchParams.from);
    if (searchParams.to) sp.set("to", searchParams.to);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/employee?${qs}` : "/employee";
  };

  const pcdCount =
    divisionStats.find((d) => d.division === "PCD_FRANCHISE")?._count._all || 0;
  const tpCount =
    divisionStats.find((d) => d.division === "THIRD_PARTY")?._count._all || 0;
  const totalLeads = pcdCount + tpCount;

  const isKesrox = Boolean(
    company?.id === "cmubi8zf6000004l8y45hhuds" ||
    company?.slug?.toLowerCase().includes("kesrox") ||
    company?.name?.toLowerCase().includes("kesrox")
  );

  const answerRate = totalCallsCount > 0 ? Math.round((callsPickedCount / totalCallsCount) * 100) : 0;

  return (
    <div className="space-y-7">
      {/* Top Rep Greeting Banner */}
      <section className="relative overflow-hidden rounded-3xl p-4 sm:p-7 neo-panel border-t-2 border-t-primary/80 bg-white">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Session
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Field Telecaller & Commercial Desk
              </span>
            </div>

            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              Welcome, <GradientText>{employee?.name}</GradientText>!
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center shrink-0">
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                My Pipeline
              </p>
              <p className="mt-1 text-2xl font-black text-ink">{totalLeads}</p>
              {periodNewLeads !== null && (
                <p className="text-[10px] font-bold text-primary mt-0.5">
                  {periodNewLeads} in {dateFilter.label}
                </p>
              )}
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                PCD Franchise
              </p>
              <p className="mt-1 text-2xl font-black text-blue-700">{pcdCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Third-Party
              </p>
              <p className="mt-1 text-2xl font-black text-purple-700">{tpCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                {dateFilter.preset === "all_time" ? "Total Calls" : `Calls (${dateFilter.label})`}
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{totalCallsCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Field Telecalling Operational Insights (Pure Numbers - Strict Privacy on AI Summaries) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-white neo-panel border-t-2 border-t-rose-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
            {dateFilter.preset === "all_time" ? "Calls Today" : `Calls (${dateFilter.label})`}
          </p>
          <p className="mt-1 text-2xl font-black text-rose-600">{callsToday}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">{allTimeCallsCount} all-time calls</p>
        </div>

        <div className="rounded-2xl p-4 bg-white neo-panel border-t-2 border-t-emerald-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Picked / Answered</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">{callsPickedCount}</p>
          <p className="mt-0.5 text-[11px] text-emerald-600 font-bold">{answerRate}% Connection Rate</p>
        </div>

        <div className="rounded-2xl p-4 bg-white neo-panel border-t-2 border-t-amber-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Not Answered / Missed</p>
          <p className="mt-1 text-2xl font-black text-amber-700">{callsMissedCount}</p>
          <p className="mt-0.5 text-[11px] text-amber-700 font-bold">
            {callsMissedCount > 0 ? `${totalCallsCount > 0 ? Math.round((callsMissedCount / totalCallsCount) * 100) : 0}% Missed` : "Zero missed calls"}
          </p>
        </div>

        <div className="rounded-2xl p-4 bg-white neo-panel border-t-2 border-t-teal-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Calling Cadence</p>
          <p className="mt-1 text-2xl font-black text-teal-700">{answerRate >= 60 ? "🔥 High" : "⚡ Active"}</p>
          <p className="mt-0.5 text-[11px] text-teal-700">Telecalling Desk Active</p>
        </div>
      </section>

      {/* Follow-up reminders */}
      {(overdueFollowUps > 0 || todayFollowUps > 0) && (
        <Link
          href="/employee/leads?followUp=due"
          className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-violet-50 to-orange-50 p-4 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg shadow-xs">⏰</span>
            <div>
              <p className="text-sm font-extrabold text-ink">Follow-ups need your attention</p>
              <p className="text-xs font-semibold text-ink-muted">
                {overdueFollowUps > 0 && <span className="text-rose-700">{overdueFollowUps} overdue</span>}
                {overdueFollowUps > 0 && todayFollowUps > 0 && " • "}
                {todayFollowUps > 0 && <span className="text-amber-700">{todayFollowUps} due today</span>}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-sky-800">View follow-ups &rarr;</span>
        </Link>
      )}

      {/* Unanswered Call Recovery Queue (1-Tap WhatsApp Alert) */}
      {missedCallsQueue.length > 0 && (
        <section className="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-white border-2 border-amber-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white text-sm">
                ⚡
              </span>
              <div>
                <h3 className="font-extrabold text-ink text-sm sm:text-base">
                  Unanswered Call Follow-Up Desk ({missedCallsQueue.length} Inquiries)
                </h3>
              </div>
            </div>
            <Link
              href="/employee/leads"
              className="text-xs font-bold text-amber-800 underline hover:text-amber-900 self-end sm:self-auto"
            >
              Go to Leads &rarr;
            </Link>
          </div>

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
            {missedCallsQueue.map((call) => {
              const partyName = call.lead?.name || call.client?.name || "Prospect";
              const partyPhone = call.lead?.phoneNumber || call.client?.phoneNumber;

              return (
                <div
                  key={call.id}
                  className="rounded-2xl p-3.5 bg-white border border-amber-200 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-xs text-ink truncate">{partyName}</p>
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 shrink-0">
                        Missed
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-ink-muted truncate mt-0.5">
                      {partyPhone || "No Phone"} • {new Date(call.occurredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <MissedCallAlertButton
                    callId={call.id}
                    leadName={partyName}
                    repName={employee?.name}
                    companyName={company?.name}
                    division={call.lead?.division}
                    territory={call.lead?.city || undefined}
                    phoneNumber={partyPhone}
                    alreadySent={call.whatsappSent}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Admin Allotments Notice (Connecting Employee with Admin Actions) */}
      {recentAllotments.length > 0 && (
        <section className="rounded-2xl p-3.5 sm:p-4 bg-teal-50/80 border border-teal-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 text-sm">
                ⚡
              </span>
              <div>
                <p className="text-xs font-extrabold text-teal-900">
                  New Leads Allotted by Admin
                </p>
                <p className="text-[11px] text-teal-700 mt-0.5">
                  Latest: {recentAllotments[0].reason || "Direct bulk batch allocation"} • {new Date(recentAllotments[0].reassignedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <Link
              href="/employee/leads"
              className="text-xs font-bold text-teal-800 underline hover:text-teal-900 self-end sm:self-auto"
            >
              View All In Allotments Desk &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* Assigned Leads Allotment Desk Preview */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-ink">
              My Assigned Inquiries Workdesk
            </h2>
          </div>
          <Link
            href="/employee/leads"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>View All {totalLeads} Allotted Leads</span>
            <span>&rarr;</span>
          </Link>
        </div>

        {leads.length === 0 ? (
          <div className="rounded-3xl p-8 sm:p-10 text-center neo-panel bg-white border border-line">
            <p className="text-sm font-bold text-ink">Zero Inquiries Assigned Yet</p>
            <p className="text-xs text-ink-muted mt-1">
              When Admin allocates leads to your profile, they will appear here instantly.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
            {/* Desktop Table View matching Allotted Leads Desk */}
            <div className="hidden md:block overflow-x-auto crm-table-container w-full">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-3.5 py-3 w-[24%] min-w-[200px] whitespace-nowrap">Prospect &amp; Contact</th>
                    <th className="px-2 py-3 w-[11%] min-w-[85px] text-center whitespace-nowrap">Category</th>
                    <th className="px-2 py-3 w-[14%] min-w-[115px] text-center whitespace-nowrap">Platform</th>
                    <th className="px-3 py-3 w-[24%] min-w-[190px] whitespace-nowrap">Follow-Up Action</th>
                    <th className="px-2 py-3 w-[13%] min-w-[105px] text-center whitespace-nowrap">Remarks</th>
                    <th className="px-3 py-3 w-[14%] min-w-[110px] text-right whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.map((lead, idx) => {
                    const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                    const isThirdParty = lead.division === "THIRD_PARTY";
                    const isCurrentFresh = isFreshLead(lead);
                    const prevLead = idx > 0 ? leads[idx - 1] : null;
                    const isTransitionToPipeline = prevLead && isFreshLead(prevLead) && !isCurrentFresh;
                    const isFirstLead = idx === 0;

                    return (
                      <Fragment key={lead.id}>
                        {isFirstLead && isCurrentFresh && (
                          <tr className="bg-transparent">
                            <td colSpan={6} className="px-5 py-2">
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
                            <td colSpan={6} className="px-5 py-2">
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
                          <td className="px-3.5 py-3 w-[24%] min-w-[200px] relative">
                            {/* Floating small NEW tag on top-left, floating outside flow */}
                            {isCurrentFresh && (
                              <span
                                title="Fresh uncontacted lead"
                                className="absolute top-1.5 left-2 inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0 text-[8px] font-black uppercase tracking-wider shadow-2xs select-none pointer-events-none z-10"
                              >
                                <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                <span>NEW</span>
                              </span>
                            )}
                            <div className={`space-y-0.5 ${isCurrentFresh ? "pt-2.5" : ""}`}>
                              <p className="font-extrabold text-ink text-sm min-w-0 truncate">
                                <span>{lead.name || "Anonymous Prospect"}</span>
                              </p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-muted whitespace-nowrap">
                              <span>{lead.phoneNumber || "No Phone"}</span>
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
                        <td className="px-2 py-3 w-[11%] min-w-[85px] text-center whitespace-nowrap">
                          <CategoryBadge division={lead.division} />
                        </td>

                        {/* Channel / Source */}
                        <td className="px-2 py-3 w-[14%] min-w-[115px] text-center whitespace-nowrap">
                          <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                        </td>

                        {/* Follow Up */}
                        <td className="px-3 py-3 w-[24%] min-w-[190px]">
                          <FollowUpPicker
                            leadId={lead.id}
                            followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                            size="sm"
                          />
                        </td>

                        {/* Remarks */}
                        <td className="px-2 py-3 w-[13%] min-w-[105px] text-center whitespace-nowrap">
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
                        <td className="px-3 py-3 w-[14%] min-w-[110px] text-right whitespace-nowrap">
                          <div className="inline-flex justify-end">
                            <LeadStatusToggle leadId={lead.id} status={lead.status} deadReason={lead.deadReason} layout="vertical" />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards View (md:hidden) */}
            <div className="md:hidden divide-y divide-line">
              {leads.map((lead, idx) => {
                const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                const isThirdParty = lead.division === "THIRD_PARTY";
                const isCurrentFresh = isFreshLead(lead);
                const prevLead = idx > 0 ? leads[idx - 1] : null;
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
                    <div className="p-4 space-y-3 transition rounded-2xl mx-1.5 my-1.5 bg-white border border-line relative">
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
                      <div className={`flex items-start justify-between gap-2 ${isCurrentFresh ? "pt-2" : ""}`}>
                        <div>
                          <p className="font-bold text-ink text-base">{lead.name || "Anonymous Prospect"}</p>
                          <p className="font-mono text-ink-muted text-xs mt-0.5">{lead.phoneNumber}</p>
                          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-muted mt-1">
                            <span>📅</span>
                            <span>{formatLeadDateTime(lead.createdAt)}</span>
                          </div>
                        </div>
                        <CategoryBadge division={lead.division} />
                      </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
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

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line-soft">
                      <FollowUpPicker
                        leadId={lead.id}
                        followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                        size="sm"
                      />
                      <LeadStatusToggle leadId={lead.id} status={lead.status} deadReason={lead.deadReason} layout="horizontal" />
                    </div>

                    {cleanPhone && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <a
                          href={`tel:${cleanPhone}`}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 py-1.5 text-xs font-bold text-blue-700 active:bg-blue-200"
                        >
                          <span>📞</span>
                          <span>Call Direct</span>
                        </a>
                        <a
                          href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 py-1.5 text-xs font-bold text-emerald-700 active:bg-emerald-200"
                        >
                          <span>💬</span>
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    )}
                  </div>
                </Fragment>
                );
              })}
            </div>

            {/* Pagination Footer */}
            <PaginationBar
              currentPage={currentLeadPage}
              totalPages={totalLeadPages}
              totalItems={assignedLeadsCount}
              pageSize={LEADS_PER_PAGE}
              itemName="leads"
              buildHref={buildDashboardUrl}
            />
          </div>
        )}
      </section>

      {/* Assigned Reorder Follow-up Tasks */}
      <section className="rounded-3xl p-4 sm:p-6 neo-panel bg-white border border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-4 gap-2">
          <div>
            <h2 className="font-bold text-ink text-base">
              My Assigned Reorder Follow-up Tasks ({pendingTasks.length})
            </h2>
          </div>
          <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 text-xs font-bold self-start sm:self-auto">
            Field Action Queue
          </span>
        </div>

        <div className="mt-4 divide-y divide-line-soft">
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink text-sm">{task.title}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                      task.priority === "URGENT"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : "bg-purple-100 text-purple-800 border-purple-200"
                    }`}
                  >
                    {task.priority}
                  </span>
                  <span className="text-xs text-ink-muted">
                    📍 {task.client.territory ? `${task.client.territory.city}, ${task.client.territory.state}` : "Area"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted max-w-2xl">{task.description}</p>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-ink-faint font-mono">
                    Client: {task.client.phoneNumber || "No phone recorded"}
                  </span>
                  {task.client.phoneNumber && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${task.client.phoneNumber.replace(/\D/g, "")}`}
                        className="h-6 w-6 rounded-md bg-blue-50 text-blue-700 inline-flex items-center justify-center text-xs"
                      >
                        📞
                      </a>
                      <a
                        href={`https://wa.me/${task.client.phoneNumber.replace(/\D/g, "").startsWith("91") ? task.client.phoneNumber.replace(/\D/g, "") : `91${task.client.phoneNumber.replace(/\D/g, "")}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 inline-flex items-center justify-center text-xs"
                      >
                        💬
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                <form action={completeFollowupTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✓</span> Mark Contact Completed
                  </button>
                </form>
              </div>
            </div>
          ))}

          {!pendingTasks.length && (
            <div className="py-8 text-center text-xs text-ink-faint">
              Zero pending reorder follow-ups assigned. You are completely caught up!
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
