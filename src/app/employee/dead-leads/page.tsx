import Link from "next/link";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { updateLeadActiveStatus, addLeadRemark } from "@/lib/admin-actions";
import { SourceBadge } from "@/components/SourceBadge";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";

export const dynamic = "force-dynamic";

interface EmployeeDeadLeadsPageProps {
  searchParams?: Promise<{
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    type?: string;
    category?: string;
  }>;
}

export default async function EmployeeDeadLeadsPage(props: EmployeeDeadLeadsPageProps) {
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
  const search = (params?.search || "").trim().toLowerCase();
  const rawType = (params?.type || params?.category || "all").toLowerCase();
  const activeType = rawType === "dead" || rawType === "irrelevant" ? rawType : "all";

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  const baseCompanyFilter = scopeToCompany(activeCompanyId);

  const dateWhere = dateFilter.start && dateFilter.end
    ? { updatedAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { updatedAt: { gte: dateFilter.start } }
    : {};

  // Strict Tenant & Representative Isolation:
  // ONLY fetch leads where assignedEmployeeId === employeeId AND companyId === activeCompanyId
  const [employee, allDeadLeads] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.lead.findMany({
      where: {
        status: LeadStatus.NOT_INTERESTED,
        assignedEmployeeId: employeeId,
        ...baseCompanyFilter,
        ...dateWhere,
      },
      include: {
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ deadAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  // Apply search query across prospect name, phone, city, state and employee remarks
  let filteredBySearch = allDeadLeads;
  if (search) {
    filteredBySearch = filteredBySearch.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const phone = (l.phoneNumber || "").toLowerCase();
      const details = (l.inquiryDetails || "").toLowerCase();
      const city = (l.city || "").toLowerCase();
      const remarksText = l.remarks.map((r) => (r.remark || "").toLowerCase()).join(" ");
      return (
        name.includes(search) ||
        phone.includes(search) ||
        details.includes(search) ||
        city.includes(search) ||
        remarksText.includes(search)
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
  const rawPage = parseInt(params?.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedDeadLeads = visibleLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const buildEmployeeDeadLeadsUrl = (page: number, newType?: string) => {
    const sp = new URLSearchParams();
    const t = newType !== undefined ? newType : (activeType !== "all" ? activeType : undefined);
    if (t && t !== "all") sp.set("type", t);
    if (params?.search) sp.set("search", params.search);
    if (params?.range) sp.set("range", params.range);
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (page > 1) sp.set("page", String(page));

    const qs = sp.toString();
    return qs ? `/employee/dead-leads?${qs}` : "/employee/dead-leads";
  };

  return (
    <div className="space-y-6">
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
              My Dead <GradientText>Leads</GradientText> ({totalItems})
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Representative: <strong className="text-ink">{employee?.name}</strong> • Only leads closed by you are listed here.
            </p>
          </div>

          {/* Search Box */}
          <form method="GET" action="/employee/dead-leads" className="flex items-center gap-2">
            {activeType !== "all" && <input type="hidden" name="type" value={activeType} />}
            {params?.range && <input type="hidden" name="range" value={params.range} />}
            <input
              type="text"
              name="search"
              defaultValue={params?.search || ""}
              placeholder="Search by name, phone or remarks..."
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-64"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Filter
            </button>
            {params?.search && (
              <Link
                href={activeType !== "all" ? `/employee/dead-leads?type=${activeType}` : "/employee/dead-leads"}
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
            href={buildEmployeeDeadLeadsUrl(1, "all")}
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
            href={buildEmployeeDeadLeadsUrl(1, "dead")}
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
            href={buildEmployeeDeadLeadsUrl(1, "irrelevant")}
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
            {search
              ? "No closed leads matched your search query in this category."
              : "No leads currently meet the selected filter criteria."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-3 px-4">Prospect</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">City / State</th>
                  <th className="py-3 px-4">Closed Date</th>
                  <th className="py-3 px-4">Remarks History</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedDeadLeads.map((lead) => {
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const hasRemarks = lead.remarks.length > 0;
                  const latestRemark = hasRemarks ? lead.remarks[0] : null;
                  const olderRemarks = hasRemarks ? lead.remarks.slice(1) : [];
                  const isIrrelevant = lead.deadReason === "IRRELEVANT";

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Prospect */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-ink">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </div>
                        <p className="font-mono text-[11px] text-ink-muted">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isIrrelevant ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 shadow-2xs">
                            <span>🚫</span>
                            <span>Irrelevant</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shadow-2xs">
                            <span>🔴</span>
                            <span>Dead</span>
                          </span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      {/* City / State */}
                      <td className="py-3 px-4 text-ink-muted">
                        {lead.city || lead.state ? `${lead.city || ""} ${lead.state || ""}`.trim() : "—"}
                      </td>

                      {/* Closed Date */}
                      <td className="py-3 px-4 text-ink-muted whitespace-nowrap">
                        {lead.deadAt
                          ? new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : new Date(lead.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>

                      {/* Remarks History */}
                      <td className="py-3 px-4 min-w-[280px] max-w-sm">
                        {hasRemarks && latestRemark ? (
                          <div className="space-y-1.5">
                            {/* Latest Remark Card */}
                            <div className="rounded-xl bg-amber-50/80 border border-amber-200/90 p-2.5 shadow-2xs">
                              <div className="flex items-center justify-between text-[10px] text-amber-800 font-bold mb-1">
                                <span className="inline-flex items-center gap-1">
                                  <span>📝</span>
                                  <span>{lead.remarks.length > 1 ? "Latest Remark" : "Remark"}</span>
                                </span>
                                <span className="text-[10px] text-amber-700/80 font-normal">
                                  {new Date(latestRemark.createdAt).toLocaleString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-amber-950 leading-snug whitespace-pre-wrap">
                                {latestRemark.remark}
                              </p>
                              <p className="mt-1 text-[10px] text-amber-700 font-medium">
                                — {latestRemark.employee?.name || "Representative"}
                              </p>
                            </div>

                            {/* Previous Remarks (Expandable) */}
                            {olderRemarks.length > 0 && (
                              <details className="group/hist text-left">
                                <summary className="cursor-pointer text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 select-none py-0.5">
                                  <span>📜</span>
                                  <span className="group-open/hist:hidden underline decoration-dotted">
                                    View all earlier remarks ({olderRemarks.length})
                                  </span>
                                  <span className="hidden group-open/hist:inline underline decoration-dotted">
                                    Hide earlier remarks
                                  </span>
                                </summary>
                                <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                  {olderRemarks.map((r) => (
                                    <div key={r.id} className="rounded-lg bg-slate-50 border border-line p-2 text-xs">
                                      <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{r.remark}</p>
                                      <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
                                        <span className="font-semibold">{r.employee?.name || "Representative"}</span>
                                        <span>
                                          {new Date(r.createdAt).toLocaleString("en-IN", {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}

                            {/* Add Remark Dropdown */}
                            <details className="group/add text-left inline-block mt-0.5">
                              <summary className="cursor-pointer text-[11px] font-bold text-primary hover:underline flex items-center gap-1 select-none">
                                <span>+ Add Remark</span>
                              </summary>
                              <div className="absolute mt-1.5 w-72 rounded-2xl bg-white p-3 shadow-xl border border-line z-30">
                                <form action={addLeadRemark} className="space-y-2">
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <textarea
                                    name="remark"
                                    rows={2}
                                    required
                                    placeholder="Add a remark for this lead..."
                                    className="w-full rounded-xl bg-slate-50 border border-line p-2 text-xs text-ink focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="submit"
                                      className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white hover:bg-primary-strong transition cursor-pointer"
                                    >
                                      Save Remark
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </details>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-xs text-ink-faint italic block">No remarks recorded yet</span>
                            <details className="group/add text-left inline-block">
                              <summary className="cursor-pointer text-[11px] font-bold text-primary hover:underline flex items-center gap-1 select-none">
                                <span>+ Add Remark</span>
                              </summary>
                              <div className="absolute mt-1.5 w-72 rounded-2xl bg-white p-3 shadow-xl border border-line z-30">
                                <form action={addLeadRemark} className="space-y-2">
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <textarea
                                    name="remark"
                                    rows={2}
                                    required
                                    placeholder="Add a remark for this lead..."
                                    className="w-full rounded-xl bg-slate-50 border border-line p-2 text-xs text-ink focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="submit"
                                      className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white hover:bg-primary-strong transition cursor-pointer"
                                    >
                                      Save Remark
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </details>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap min-w-[320px]">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Call prospect"
                                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100 active:scale-95 transition shadow-2xs"
                              >
                                <span className="text-xs leading-none">📞</span>
                                <span className="leading-none">Call</span>
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Open WhatsApp chat"
                                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100 active:scale-95 transition shadow-2xs"
                              >
                                <span className="text-xs leading-none">💬</span>
                                <span className="leading-none">WhatsApp</span>
                              </a>
                            </>
                          )}

                          {/* Switch Category Action (Dead <-> Irrelevant) */}
                          {isIrrelevant ? (
                            <form action={updateLeadActiveStatus} className="inline-block shrink-0">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="status" value="DEAD" />
                              <input type="hidden" name="deadReason" value="DEAD" />
                              <button
                                type="submit"
                                title="Switch classification to Dead Lead"
                                className="inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 active:scale-95 transition shadow-2xs cursor-pointer"
                              >
                                <span>🔴</span>
                                <span>To Dead</span>
                              </button>
                            </form>
                          ) : (
                            <form action={updateLeadActiveStatus} className="inline-block shrink-0">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="status" value="IRRELEVANT" />
                              <input type="hidden" name="deadReason" value="IRRELEVANT" />
                              <button
                                type="submit"
                                title="Switch classification to Irrelevant Inquiry"
                                className="inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 active:scale-95 transition shadow-2xs cursor-pointer"
                              >
                                <span>🚫</span>
                                <span>To Irrelevant</span>
                              </button>
                            </form>
                          )}

                          {/* Reactivate Lead */}
                          <form action={updateLeadActiveStatus} className="inline-block shrink-0">
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="status" value="ACTIVE" />
                            <button
                              type="submit"
                              title="Reactivate lead back into active pipeline"
                              className="inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-95 transition shadow-2xs cursor-pointer"
                            >
                              <span>↺</span>
                              <span>Reactivate</span>
                            </button>
                          </form>
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
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const hasRemarks = lead.remarks.length > 0;
              const latestRemark = hasRemarks ? lead.remarks[0] : null;
              const olderRemarks = hasRemarks ? lead.remarks.slice(1) : [];
              const isIrrelevant = lead.deadReason === "IRRELEVANT";

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-ink text-base">
                        <ProtectedData text={lead.name || "Unnamed Prospect"} />
                      </h3>
                      <p className="font-mono text-xs text-ink-muted mt-0.5">
                        <ProtectedData text={lead.phoneNumber || "No phone"} />
                      </p>
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
                    {lead.deadAt && (
                      <span className="text-ink-faint text-[11px]">
                        Closed: {new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {/* Remarks History Card */}
                  <div className="rounded-2xl bg-amber-50/50 border border-amber-200/80 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5">
                        <span>📝</span>
                        <span>Remarks History ({lead.remarks.length})</span>
                      </span>
                    </div>

                    {hasRemarks && latestRemark ? (
                      <div className="space-y-2">
                        <div className="rounded-xl bg-white border border-amber-200/90 p-2.5 shadow-2xs">
                          <p className="text-xs font-semibold text-amber-950 leading-snug whitespace-pre-wrap">
                            {latestRemark.remark}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-amber-700">
                            <span className="font-medium">— {latestRemark.employee?.name || "Representative"}</span>
                            <span>
                              {new Date(latestRemark.createdAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>

                        {olderRemarks.length > 0 && (
                          <details className="group/hist text-left">
                            <summary className="cursor-pointer text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 select-none py-0.5">
                              <span>📜</span>
                              <span className="group-open/hist:hidden underline decoration-dotted">
                                Earlier remarks ({olderRemarks.length})
                              </span>
                              <span className="hidden group-open/hist:inline underline decoration-dotted">
                                Hide earlier remarks
                              </span>
                            </summary>
                            <div className="mt-1.5 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {olderRemarks.map((r) => (
                                <div key={r.id} className="rounded-lg bg-white border border-amber-200/60 p-2 text-xs">
                                  <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{r.remark}</p>
                                  <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
                                    <span className="font-medium">{r.employee?.name || "Representative"}</span>
                                    <span>
                                      {new Date(r.createdAt).toLocaleString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted italic">No remarks recorded yet</p>
                    )}

                    {/* Quick Add Remark Form */}
                    <details className="group/add text-left pt-1">
                      <summary className="cursor-pointer text-[11px] font-bold text-primary hover:underline flex items-center gap-1 select-none">
                        <span>+ Add Remark</span>
                      </summary>
                      <form action={addLeadRemark} className="mt-2 space-y-2">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <textarea
                          name="remark"
                          rows={2}
                          required
                          placeholder="Add a remark for this lead..."
                          className="w-full rounded-xl bg-white border border-line p-2 text-xs text-ink focus:outline-none focus:border-primary"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white shadow-2xs"
                          >
                            Save Remark
                          </button>
                        </div>
                      </form>
                    </details>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <div className="flex items-center gap-2">
                      {cleanPhone && (
                        <>
                          <a
                            href={`tel:${cleanPhone}`}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-2xs"
                          >
                            <span className="text-xs leading-none">📞</span>
                            <span className="leading-none">Call</span>
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-2xs"
                          >
                            <span className="text-xs leading-none">💬</span>
                            <span className="leading-none">WhatsApp</span>
                          </a>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Switch Category Action (Dead <-> Irrelevant) */}
                      {isIrrelevant ? (
                        <form action={updateLeadActiveStatus}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="status" value="DEAD" />
                          <input type="hidden" name="deadReason" value="DEAD" />
                          <button
                            type="submit"
                            title="Switch classification to Dead Lead"
                            className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 active:bg-rose-100 transition shadow-2xs cursor-pointer"
                          >
                            <span>🔴</span>
                            <span>To Dead</span>
                          </button>
                        </form>
                      ) : (
                        <form action={updateLeadActiveStatus}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="status" value="IRRELEVANT" />
                          <input type="hidden" name="deadReason" value="IRRELEVANT" />
                          <button
                            type="submit"
                            title="Switch classification to Irrelevant Inquiry"
                            className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 active:bg-amber-100 transition shadow-2xs cursor-pointer"
                          >
                            <span>🚫</span>
                            <span>To Irrelevant</span>
                          </button>
                        </form>
                      )}

                      {/* Reactivate Lead */}
                      <form action={updateLeadActiveStatus}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 active:bg-emerald-100 transition shadow-2xs cursor-pointer"
                        >
                          <span>↺</span>
                          <span>Reactivate</span>
                        </button>
                      </form>
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
            buildHref={(page) => buildEmployeeDeadLeadsUrl(page)}
          />
        </div>
      )}
    </div>
  );
}
