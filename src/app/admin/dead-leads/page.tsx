import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { LeadStatus } from "@/generated/prisma/enums";
import { deleteLead, updateLeadActiveStatus } from "@/lib/admin-actions";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { SourceBadge } from "@/components/SourceBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";
import { formatLeadDateTime, formatLeadDateParts } from "@/lib/date-format";
import { LeadRemarksModal } from "@/components/LeadRemarksModal";

async function deleteLeadAction(formData: FormData) {
  "use server";
  await deleteLead(formData);
  redirect("/admin/dead-leads");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}

function buildAiReason(lead: {
  inquiryDetails: string | null;
  calls: { aiSummary: string | null; occurredAt: Date }[];
}): string {
  const latestCallWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
  if (latestCallWithSummary?.aiSummary) {
    return truncate(latestCallWithSummary.aiSummary, 220);
  }
  if (lead.inquiryDetails) {
    return truncate(lead.inquiryDetails, 220);
  }
  return "No AI call summary or inquiry notes on record for this lead.";
}

interface DeadLeadsPageProps {
  searchParams?: Promise<{
    employeeId?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    search?: string;
    type?: string;
    category?: string;
  }>;
}

export default async function DeadLeadsPage(props: DeadLeadsPageProps) {
  const resolvedParams = props.searchParams ? await props.searchParams : {};
  const employeeId = resolvedParams.employeeId || "";
  const search = (resolvedParams.search || "").trim().toLowerCase();
  const rawType = (resolvedParams.type || resolvedParams.category || "all").toLowerCase();
  const activeType = rawType === "dead" || rawType === "irrelevant" ? rawType : "all";

  const dateFilter = parseDashboardDateFilter(
    resolvedParams.range,
    resolvedParams.from,
    resolvedParams.to
  );

  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = scopeToCompany(activeCompanyId);

  const dateWhere = dateFilter.start && dateFilter.end
    ? { updatedAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { updatedAt: { gte: dateFilter.start } }
    : {};

  const allDeadLeads = await prisma.lead.findMany({
    where: {
      status: LeadStatus.NOT_INTERESTED,
      ...companyScope,
      ...dateWhere,
      ...(employeeId ? { assignedEmployeeId: employeeId } : {}),
    },
    include: {
      assignedEmployee: { select: { id: true, name: true, phoneNumber: true } },
      calls: {
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          occurredAt: true,
          durationSec: true,
          missed: true,
          aiSummary: true,
          direction: true,
          transcript: true,
          recordingUrl: true,
        },
      },
      remarks: {
        include: { employee: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ deadAt: "desc" }, { updatedAt: "desc" }],
  });

  // Apply search filter if present (supports digit-normalized phone search)
  let filteredBySearch = allDeadLeads;
  if (search) {
    const cleanSearchDigits = search.replace(/\D/g, "");
    filteredBySearch = filteredBySearch.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const phone = (l.phoneNumber || "").toLowerCase();
      const cleanPhoneDigits = phone.replace(/\D/g, "");
      const details = (l.inquiryDetails || "").toLowerCase();
      const rep = (l.assignedEmployee?.name || "").toLowerCase();
      const city = (l.city || "").toLowerCase();
      const phoneMatches =
        phone.includes(search) ||
        (cleanSearchDigits.length >= 3 && cleanPhoneDigits.includes(cleanSearchDigits));
      return (
        name.includes(search) ||
        phoneMatches ||
        details.includes(search) ||
        rep.includes(search) ||
        city.includes(search)
      );
    });
  }

  // Counts for tabs
  const totalAllCount = filteredBySearch.length;
  const totalDeadCount = filteredBySearch.filter((l) => l.deadReason !== "IRRELEVANT").length;
  const totalIrrelevantCount = filteredBySearch.filter((l) => l.deadReason === "IRRELEVANT").length;

  // Apply category filter (All / Dead / Irrelevant)
  let visibleLeads = filteredBySearch;
  if (activeType === "dead") {
    visibleLeads = filteredBySearch.filter((l) => l.deadReason !== "IRRELEVANT");
  } else if (activeType === "irrelevant") {
    visibleLeads = filteredBySearch.filter((l) => l.deadReason === "IRRELEVANT");
  }

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(resolvedParams.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedDeadLeads = visibleLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const repName = employeeId
    ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }))?.name ?? null
    : null;

  const buildDeadLeadsUrl = (page: number, newType?: string) => {
    const sp = new URLSearchParams();
    const t = newType !== undefined ? newType : (activeType !== "all" ? activeType : undefined);
    if (t && t !== "all") sp.set("type", t);
    if (resolvedParams.employeeId) sp.set("employeeId", resolvedParams.employeeId);
    if (resolvedParams.search) sp.set("search", resolvedParams.search);
    if (resolvedParams.range) sp.set("range", resolvedParams.range);
    if (resolvedParams.from) sp.set("from", resolvedParams.from);
    if (resolvedParams.to) sp.set("to", resolvedParams.to);
    if (page > 1) sp.set("page", String(page));

    const qs = sp.toString();
    return qs ? `/admin/dead-leads?${qs}` : "/admin/dead-leads";
  };

  return (
    <div className="space-y-6 pb-28">
      {repName && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900">
          Showing only <strong>{repName}</strong>
          <Link href="/admin/dead-leads" className="ml-auto text-xs font-bold text-sky-700 underline">Show everyone</Link>
        </div>
      )}

      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-rose-500/70 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Closed-Out Inquiries
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">
              Dead <GradientText>Leads</GradientText> ({totalItems})
            </h1>
          </div>

          {/* Live Search Form */}
          <form method="GET" action="/admin/dead-leads" className="flex items-center gap-2">
            {activeType !== "all" && <input type="hidden" name="type" value={activeType} />}
            {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
            {resolvedParams.range && <input type="hidden" name="range" value={resolvedParams.range} />}
            <input
              type="text"
              name="search"
              defaultValue={resolvedParams.search || ""}
              placeholder="Search dead lead or rep..."
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-64"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Filter
            </button>
            {resolvedParams.search && (
              <Link
                href={activeType !== "all" ? `/admin/dead-leads?type=${activeType}` : "/admin/dead-leads"}
                className="rounded-xl border border-line bg-white px-2.5 py-2 text-xs font-bold text-ink-muted hover:bg-slate-50 transition"
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        {/* Classification Filter Tabs */}
        <div className="mt-5 pt-4 border-t border-line-soft flex flex-wrap items-center gap-2">
          <Link
            href={buildDeadLeadsUrl(1, "all")}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
              activeType === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-ink-muted border border-line hover:bg-slate-100 hover:text-ink"
            }`}
          >
            <span>All</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeType === "all" ? "bg-slate-800 text-white" : "bg-white text-ink border border-line-soft"
              }`}
            >
              {totalAllCount}
            </span>
          </Link>

          <Link
            href={buildDeadLeadsUrl(1, "dead")}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
              activeType === "dead"
                ? "bg-rose-600 text-white"
                : "bg-white text-ink-muted border border-line hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50"
            }`}
          >
            <span>🔴 Dead</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeType === "dead" ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {totalDeadCount}
            </span>
          </Link>

          <Link
            href={buildDeadLeadsUrl(1, "irrelevant")}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
              activeType === "irrelevant"
                ? "bg-amber-600 text-white"
                : "bg-white text-ink-muted border border-line hover:border-amber-300 hover:text-amber-800 hover:bg-amber-50/50"
            }`}
          >
            <span>🚫 Irrelevant</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeType === "irrelevant" ? "bg-amber-700 text-white" : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {totalIrrelevantCount}
            </span>
          </Link>
        </div>
      </section>

      {visibleLeads.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            ✅
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">
            {activeType === "dead"
              ? "No Dead Leads Found"
              : activeType === "irrelevant"
              ? "No Irrelevant Leads Found"
              : "No Closed Leads"}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {search ? "No dead leads matched your search query in this category." : "No leads currently meet the selected filter criteria."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto crm-table-container w-full">
            <table className="w-full text-left text-xs min-w-[1050px]">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-3 px-4 w-[240px] min-w-[220px] whitespace-nowrap">Prospect</th>
                  <th className="py-3 px-4 w-[130px] min-w-[120px] whitespace-nowrap">Category</th>
                  <th className="py-3 px-4 w-[160px] min-w-[150px] whitespace-nowrap">Source</th>
                  <th className="py-3 px-4 w-[180px] min-w-[170px] whitespace-nowrap">Representative</th>
                  <th className="py-3 px-4 w-[160px] min-w-[150px] whitespace-nowrap">Remarks</th>
                  <th className="py-3 px-4 w-[210px] min-w-[200px] text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedDeadLeads.map((lead) => {
                  const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
                  const isIrrelevant = lead.deadReason === "IRRELEVANT";
                  const { dateStr, timeStr } = formatLeadDateParts(lead.deadAt || lead.updatedAt);

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Prospect (Name, Phone, and Activity Date/Time stacked underneath) */}
                      <td className="py-3 px-4 w-[240px] min-w-[220px]">
                        <Link href={`/admin/lead-history/${lead.id}`} className="font-bold text-ink hover:text-rose-700 truncate block">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </Link>
                        <p className="font-mono text-[11px] text-ink-muted">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                        {dateStr && (
                          <p className="text-[10px] text-ink-faint flex items-center gap-1 mt-0.5 whitespace-nowrap font-medium">
                            <span>📅</span>
                            <span>{dateStr}</span>
                            {timeStr && <span className="font-mono">• {timeStr}</span>}
                          </p>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4 w-[130px] min-w-[120px] whitespace-nowrap">
                        {isIrrelevant ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-2xs">
                            <span>🚫</span>
                            <span>Irrelevant</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700 shadow-2xs">
                            <span>🔴</span>
                            <span>Dead</span>
                          </span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4 w-[160px] min-w-[150px]">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      {/* Representative */}
                      <td className="py-3 px-4 w-[180px] min-w-[170px] font-semibold text-ink whitespace-nowrap truncate">
                        {lead.assignedEmployee?.name || (
                          <span className="text-ink-faint">Unassigned</span>
                        )}
                      </td>

                      {/* Remarks (Global Component with AI Summaries) */}
                      <td className="py-3 px-4 w-[160px] min-w-[150px] whitespace-nowrap">
                        <LeadRemarksModal
                          leadId={lead.id}
                          leadName={lead.name ?? "Unnamed Prospect"}
                          leadPhone={lead.phoneNumber ?? "No phone recorded"}
                          leadStatus={lead.status}
                          followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                          assignedRepName={lead.assignedEmployee?.name}
                          assignedRepPhone={lead.assignedEmployee?.phoneNumber}
                          remarks={lead.remarks.map((r) => ({
                            id: r.id,
                            remark: r.remark,
                            createdAt: r.createdAt.toISOString(),
                            employeeName: r.employee?.name || "Representative",
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

                      {/* Actions */}
                      <td className="py-3 px-4 w-[210px] min-w-[200px] text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/lead-history/${lead.id}`}
                            className="rounded-xl border border-line bg-white px-2.5 py-1 text-[11px] font-bold text-ink-muted hover:bg-slate-50 transition"
                          >
                            History →
                          </Link>

                          {/* Actions Dropdown Menu */}
                          <details className="group/action relative inline-block text-left">
                            <summary className="list-none cursor-pointer inline-flex items-center gap-1 rounded-xl border border-line bg-white px-2.5 py-1 text-xs font-bold text-ink hover:bg-slate-50 active:scale-95 transition shadow-2xs select-none">
                              <span>Actions</span>
                              <span className="text-[10px] text-ink-muted">▾</span>
                            </summary>
                            <div className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-white p-1.5 shadow-xl border border-line z-30 space-y-1 text-left">
                              {/* Reactivate Lead */}
                              <form action={updateLeadActiveStatus}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="status" value="ACTIVE" />
                                <button
                                  type="submit"
                                  className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition cursor-pointer text-left"
                                >
                                  <span>↺</span>
                                  <span>Reactivate to Pipeline</span>
                                </button>
                              </form>

                              {/* Switch Category Action (Dead <-> Irrelevant) */}
                              {isIrrelevant ? (
                                <form action={updateLeadActiveStatus}>
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <input type="hidden" name="status" value="DEAD" />
                                  <input type="hidden" name="deadReason" value="DEAD" />
                                  <button
                                    type="submit"
                                    className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 transition cursor-pointer text-left"
                                  >
                                    <span>🔴</span>
                                    <span>Move to Dead Leads</span>
                                  </button>
                                </form>
                              ) : (
                                <form action={updateLeadActiveStatus}>
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <input type="hidden" name="status" value="IRRELEVANT" />
                                  <input type="hidden" name="deadReason" value="IRRELEVANT" />
                                  <button
                                    type="submit"
                                    className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition cursor-pointer text-left"
                                  >
                                    <span>🚫</span>
                                    <span>Move to Irrelevant</span>
                                  </button>
                                </form>
                              )}

                              <div className="border-t border-line my-1" />

                              {/* Delete Lead */}
                              <form action={deleteLeadAction}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <button
                                  type="submit"
                                  className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition cursor-pointer text-left"
                                >
                                  <span>🗑</span>
                                  <span>Delete Lead</span>
                                </button>
                              </form>
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {paginatedDeadLeads.map((lead) => {
              const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
              const aiReason = buildAiReason(lead);
              const isIrrelevant = lead.deadReason === "IRRELEVANT";

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/admin/lead-history/${lead.id}`} className="group">
                        <h3 className="font-extrabold text-ink text-base group-hover:text-rose-700">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </h3>
                        <p className="font-mono text-xs text-ink-muted mt-0.5">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                      </Link>
                    </div>

                    {/* Mobile Category Badge */}
                    {isIrrelevant ? (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 shrink-0 shadow-2xs">
                        🚫 Irrelevant
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shrink-0 shadow-2xs">
                        🔴 Dead Lead
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                    <span className="text-ink-muted text-xs">
                      Rep: <strong className="text-ink">{lead.assignedEmployee?.name || "Unassigned"}</strong>
                    </span>
                    {(lead.deadAt || lead.updatedAt) && (
                      <span className="text-ink-faint text-[11px]">
                        Closed: {formatLeadDateTime(lead.deadAt || lead.updatedAt)}
                      </span>
                    )}
                  </div>

                  {callWithSummary ? (
                    <Link
                      href={`/admin/calls?callId=${callWithSummary.id}`}
                      className="block rounded-xl bg-violet-50/80 hover:bg-violet-100 border border-violet-200/80 p-3 transition shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-violet-900 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <span>🤖</span>
                          <span>AI Call Summary</span>
                        </span>
                        <span className="text-violet-600 font-semibold text-[10px]">Open Call ↗</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                        {callWithSummary.aiSummary}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-xs text-ink-muted leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-line-soft">
                      {aiReason}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/lead-history/${lead.id}`}
                        className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-muted hover:bg-slate-50 transition"
                      >
                        Full History →
                      </Link>
                      <LeadRemarksModal
                        leadId={lead.id}
                        leadName={lead.name ?? "Unnamed Prospect"}
                        leadPhone={lead.phoneNumber ?? "No phone recorded"}
                        leadStatus={lead.status}
                        followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
                        assignedRepName={lead.assignedEmployee?.name}
                        assignedRepPhone={lead.assignedEmployee?.phoneNumber}
                        remarks={lead.remarks.map((r) => ({
                          id: r.id,
                          remark: r.remark,
                          createdAt: r.createdAt.toISOString(),
                          employeeName: r.employee?.name || "Representative",
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

                    <div className="flex items-center gap-2">
                      <details className="group/action relative inline-block text-left">
                        <summary className="list-none cursor-pointer inline-flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50 active:scale-95 transition shadow-2xs select-none">
                          <span>Actions</span>
                          <span className="text-[10px] text-ink-muted">▾</span>
                        </summary>
                        <div className="absolute right-0 bottom-full mb-1.5 w-48 rounded-2xl bg-white p-1.5 shadow-xl border border-line z-30 space-y-1 text-left">
                          {/* Reactivate Lead */}
                          <form action={updateLeadActiveStatus}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="status" value="ACTIVE" />
                            <button
                              type="submit"
                              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition cursor-pointer text-left"
                            >
                              <span>↺</span>
                              <span>Reactivate to Pipeline</span>
                            </button>
                          </form>

                          {/* Switch Category Action (Dead <-> Irrelevant) */}
                          {isIrrelevant ? (
                            <form action={updateLeadActiveStatus}>
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="status" value="DEAD" />
                              <input type="hidden" name="deadReason" value="DEAD" />
                              <button
                                type="submit"
                                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 transition cursor-pointer text-left"
                              >
                                <span>🔴</span>
                                <span>Move to Dead Leads</span>
                              </button>
                            </form>
                          ) : (
                            <form action={updateLeadActiveStatus}>
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="status" value="IRRELEVANT" />
                              <input type="hidden" name="deadReason" value="IRRELEVANT" />
                              <button
                                type="submit"
                                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition cursor-pointer text-left"
                              >
                                <span>🚫</span>
                                <span>Move to Irrelevant</span>
                              </button>
                            </form>
                          )}

                          <div className="border-t border-line my-1" />

                          {/* Delete Lead */}
                          <form action={deleteLeadAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <button
                              type="submit"
                              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition cursor-pointer text-left"
                            >
                              <span>🗑</span>
                              <span>Delete Lead</span>
                            </button>
                          </form>
                        </div>
                      </details>
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
            itemName="dead leads"
            buildHref={(page) => buildDeadLeadsUrl(page)}
          />
        </div>
      )}
    </div>
  );
}
