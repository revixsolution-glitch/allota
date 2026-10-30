import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { addLeadRemark } from "@/lib/admin-actions";
import { FollowUpPicker } from "@/components/FollowUpPicker";
import { LeadStatusToggle } from "@/components/LeadStatusToggle";

import { parseDashboardDateFilter } from "@/lib/date-filters";
import { CLOSED_LEAD_STATUSES, getFollowUpState } from "@/lib/follow-up";
import { GradientText } from "@/components/GradientText";
import { SourceBadge } from "@/components/SourceBadge";
import { formatInquiryDetails } from "@/lib/lead-format";

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
  const followUpFilter = ["due", "overdue", "today", "upcoming"].includes(params?.followUp || "")
    ? (params?.followUp as "due" | "overdue" | "today" | "upcoming")
    : "all";

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  const where: Record<string, any> = {
    assignedEmployeeId: employeeId,
  };

  if (selectedDivision === "PCD_FRANCHISE" || selectedDivision === "THIRD_PARTY") {
    where.division = selectedDivision;
  }

  if (dateFilter.start && dateFilter.end) {
    where.createdAt = { gte: dateFilter.start, lte: dateFilter.end };
  } else if (dateFilter.start) {
    where.createdAt = { gte: dateFilter.start };
  }

  const [leads, employee, divisionCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        _count: { select: { calls: true } },
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
      where: { assignedEmployeeId: employeeId },
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
    const st = stateOf(l);
    if (followUpFilter === "all") return true;
    if (followUpFilter === "due") return st === "overdue" || st === "today";
    return st === followUpFilter;
  };
  // Due follow-ups float to the top (oldest first); everything else keeps newest-first order.
  const filteredLeads = searchedLeads
    .filter(followUpMatches)
    .sort((a, b) => {
      const da = stateOf(a);
      const db = stateOf(b);
      const aDue = da === "overdue" || da === "today";
      const bDue = db === "overdue" || db === "today";
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (aDue && bDue) return (a.followUpAt as Date).getTime() - (b.followUpAt as Date).getTime();
      if (followUpFilter === "upcoming") return (a.followUpAt as Date).getTime() - (b.followUpAt as Date).getTime();
      return 0;
    });

  const buildUrl = (o: { division?: string; followUp?: string }) => {
    const sp = new URLSearchParams();
    const d = o.division ?? selectedDivision;
    const f = o.followUp ?? followUpFilter;
    if (d && d !== "ALL") sp.set("division", d);
    if (f && f !== "all") sp.set("followUp", f);
    if (search) sp.set("search", params?.search || "");
    const qs = sp.toString();
    return qs ? `/employee/leads?${qs}` : "/employee/leads";
  };

  return (
    <div className="space-y-6">
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
              href="/employee/leads"
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
                selectedDivision === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-canvas text-ink-muted hover:text-ink border border-line"
              }`}
            >
              All Inquiries ({totalLeads})
            </Link>
            <Link
              href="/employee/leads?division=PCD_FRANCHISE"
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
              href="/employee/leads?division=THIRD_PARTY"
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
                { key: "all", label: "All", count: null, tone: "border-line bg-canvas text-ink-muted", on: "bg-slate-800 text-white border-slate-800" },
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
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-5 py-3.5">Prospect & Contact</th>
                  <th className="px-4 py-3.5">Division Category</th>
                  <th className="px-4 py-3.5">Channel / Batch</th>
                  <th className="px-4 py-3.5">Location</th>
                  <th className="px-4 py-3.5">Follow Up</th>
                  <th className="px-4 py-3.5">Remarks</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredLeads.map((lead) => {
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const isThirdParty = lead.division === "THIRD_PARTY";

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Prospect & Contact */}
                      <td className="px-5 py-4">
                        <div className="font-extrabold text-ink text-sm">
                          {lead.name || "Anonymous Prospect"}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-muted">
                          <span>{lead.phoneNumber || "No Phone"}</span>
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Click to Call"
                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                              >
                                📞
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open WhatsApp Chat"
                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                              >
                                💬
                              </a>
                            </>
                          )}
                        </div>
                        {lead.reassignmentLogs && lead.reassignmentLogs.length > 0 && (
                          <p className="text-[10px] text-teal-700 font-bold mt-1">
                            ⚡ Allotted by Admin ({lead.reassignmentLogs[0].reason || "Direct Allotment"})
                          </p>
                        )}
                      </td>

                      {/* Division Category */}
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            isThirdParty
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {isThirdParty ? "🏭 Third-Party Mfg" : "🏢 PCD Franchise"}
                        </span>
                      </td>

                      {/* Channel / Batch */}
                      <td className="px-4 py-4">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      {/* Location */}
                      <td className="px-4 py-4 text-ink-muted">
                        {lead.city ? `${lead.city}, ${lead.state || ""}` : "—"}
                      </td>

                      {/* Follow Up */}
                      <td className="px-4 py-4">
                        <FollowUpPicker
                          leadId={lead.id}
                          followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                          size="sm"
                        />
                      </td>

                      {/* Remarks */}
                      <td className="px-4 py-4">
                        <details className="inline-block text-left group">
                          <summary className="inline-flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition cursor-pointer select-none">
                            <span>📝 Remarks</span>
                            <span className="text-[10px] text-amber-600">
                              ({lead.remarks.length})
                            </span>
                          </summary>

                          <div className="absolute mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl border border-line z-20">
                            <h4 className="text-xs font-extrabold text-ink mb-2">
                              Remarks for {lead.name || "this lead"}
                            </h4>

                            {lead.remarks.length > 0 && (
                              <div className="mb-3 max-h-40 overflow-y-auto space-y-2 pr-1">
                                {lead.remarks.map((r) => (
                                  <div key={r.id} className="rounded-xl bg-slate-50 border border-line-soft p-2">
                                    <p className="text-[11px] text-ink leading-relaxed">{r.remark}</p>
                                    <p className="mt-1 text-[10px] text-ink-faint">
                                      {r.employee.name} • {new Date(r.createdAt).toLocaleString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            <form action={addLeadRemark} className="space-y-2">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <textarea
                                name="remark"
                                rows={2}
                                required
                                placeholder="Write a short remark for admin..."
                                className="w-full rounded-xl border border-line p-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <button
                                type="submit"
                                className="w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer"
                              >
                                Add Remark
                              </button>
                            </form>
                          </div>
                        </details>
                      </td>

                      {/* Status: Active / Dead */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex">
                          <LeadStatusToggle leadId={lead.id} isDead={lead.status === LeadStatus.NOT_INTERESTED} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {filteredLeads.map((lead) => {
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const isThirdParty = lead.division === "THIRD_PARTY";

              return (
                <div key={lead.id} className="p-4 space-y-3.5">
                  {/* Prospect Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-ink text-base">
                        {lead.name || "Anonymous Prospect"}
                      </h3>
                      <p className="font-mono text-ink-muted text-xs mt-0.5">
                        {lead.phoneNumber || "No phone"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                        isThirdParty
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {isThirdParty ? "Third-Party" : "PCD Franchise"}
                    </span>
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

                  {/* Inquiry notes */}
                  {lead.inquiryDetails && (
                    <p className="text-xs text-ink-muted bg-slate-50 p-2.5 rounded-xl border border-line-soft leading-relaxed">
                      {formatInquiryDetails(lead.inquiryDetails)}
                    </p>
                  )}

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
                      <LeadStatusToggle leadId={lead.id} isDead={lead.status === LeadStatus.NOT_INTERESTED} />
                    </div>
                  </div>

                  {/* Inline Remarks accordion */}
                  <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 group">
                    <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-amber-900 select-none list-none">
                      <div className="flex items-center gap-1.5">
                        <span>📝 Remarks</span>
                        <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          {lead.remarks.length}
                        </span>
                      </div>
                      <span className="text-amber-700 font-bold transition-transform group-open:rotate-180">▾</span>
                    </summary>

                    <div className="mt-3 pt-2 border-t border-amber-200/60 space-y-2.5">
                      {lead.remarks.length > 0 && (
                        <div className="max-h-40 overflow-y-auto space-y-2">
                          {lead.remarks.map((r) => (
                            <div key={r.id} className="rounded-xl bg-white border border-line-soft p-2">
                              <p className="text-[11px] text-ink leading-relaxed">{r.remark}</p>
                              <p className="mt-1 text-[10px] text-ink-faint">
                                {r.employee.name} • {new Date(r.createdAt).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <form action={addLeadRemark} className="space-y-2">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <textarea
                          name="remark"
                          rows={2}
                          required
                          placeholder="Write a short remark for admin..."
                          className="w-full rounded-xl border border-line bg-white p-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="submit"
                          className="w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Add Remark
                        </button>
                      </form>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
