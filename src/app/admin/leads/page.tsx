import { AssignLeadsModal } from "@/components/AssignLeadsModal";
import Link from "next/link";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { allotLeadsBatch, createLead, updateLead, addSourceEmployeeMapping, removeSourceEmployeeMapping } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { SourceIcon } from "@/components/SourceIcon";
import { ExcelUploader } from "@/app/admin/sources/ExcelUploader";

const leadSources = [
  {
    value: LeadSource.META,
    label: "Meta Ads Leads",
    shortLabel: "Meta",
    detail: "Facebook and Instagram instant forms",
  },
  {
    value: LeadSource.INDIAMART,
    label: "IndiaMART Leads",
    shortLabel: "IndiaMART",
    detail: "Buyer enquiries and PCD franchise intent",
  },
  {
    value: LeadSource.WEBSITE,
    label: "Website Forms",
    shortLabel: "Website",
    detail: "Landing page, contact, and product enquiry forms",
  },
  {
    value: LeadSource.WHATSAPP,
    label: "WhatsApp Leads",
    shortLabel: "WhatsApp",
    detail: "Direct chats and missed-call follow-up replies",
  },
  {
    value: LeadSource.SOCIAL,
    label: "Social Signals",
    shortLabel: "Social",
    detail: "Ad comments, post comments, inbox messages",
  },
  {
    value: LeadSource.MANUAL,
    label: "Manual Entry",
    shortLabel: "Manual",
    detail: "Phone, referral, walk-in, or field sales entry",
  },
  {
    value: LeadSource.EXCEL_IMPORT,
    label: "Excel Import Leads",
    shortLabel: "Excel",
    detail: "Bulk directory & expo sheet uploads",
  },
];

const leadStatuses = [
  LeadStatus.NEW,
  LeadStatus.ASSIGNED,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.NOT_INTERESTED,
  LeadStatus.CONVERTED,
];

import { parseDashboardDateFilter } from "@/lib/date-filters";

const validSources = new Set<string>(leadSources.map((source) => source.value));
const SHOW_LEAD_CENTER_INSIGHTS = false;
const LEADS_PER_PAGE = 10;

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    source?: string;
    division?: string;
    unassigned?: string;
    employeeId?: string;
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const params = await searchParams;
  const selectedSource =
    params?.source && validSources.has(params.source)
      ? (params.source as LeadSource)
      : null;

  const selectedDivision: "ALL" | "PCD_FRANCHISE" | "THIRD_PARTY" =
    params?.division === "THIRD_PARTY"
      ? "THIRD_PARTY"
      : params?.division === "PCD_FRANCHISE"
        ? "PCD_FRANCHISE"
        : "ALL";
  const divisionWhere = selectedDivision === "ALL" ? {} : { division: selectedDivision };
  const divisionLabel =
    selectedDivision === "PCD_FRANCHISE"
      ? "PCD Pharma Franchise"
      : selectedDivision === "THIRD_PARTY"
        ? "Third-Party Manufacturing"
        : "All Categories";

  const unassignedOnly = params?.unassigned === "1";
  const repFilterId = params?.employeeId || "";
  const search = (params?.search || "").trim().toLowerCase();
  const requestedPage = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  // Base where clause for filtering leads table and pipeline status
  const leadWhere: Record<string, any> = {
    ...divisionWhere,
    ...companyScope,
  };
  if (selectedSource) {
    leadWhere.source = selectedSource;
  }
  if (unassignedOnly) {
    leadWhere.assignedEmployeeId = null;
  } else if (repFilterId) {
    leadWhere.assignedEmployeeId = repFilterId;
  }
  const repScope = repFilterId && !unassignedOnly ? { assignedEmployeeId: repFilterId } : {};
  if (dateFilter.start && dateFilter.end) {
    leadWhere.createdAt = { gte: dateFilter.start, lte: dateFilter.end };
  } else if (dateFilter.start) {
    leadWhere.createdAt = { gte: dateFilter.start };
  }

  // Fetch all live data in parallel using pure database logic
  const [
    leads,
    employees,
    clients,
    sourceCounts,
    statusCounts,
    divisionStats,
    unassignedDivisionStats,
    unassignedExcelBatches,
    settings,
    sourceAssignments,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      include: {
        assignedEmployee: true,
        client: { include: { territory: true } },
        _count: { select: { calls: true } },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      // Keep the newest inquiries at the top for every source and category.
      // The id tie-breaker makes the order stable when leads share a timestamp.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: {
        _count: { select: { leads: true, clients: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: companyScope,
      include: { territory: true },
      orderBy: { name: "asc" },
    }),
    // Group by source with division filter so platform cards reflect division selection
    prisma.lead.groupBy({
      by: ["source"],
      where: { ...divisionWhere, ...repScope, ...companyScope },
      _count: { _all: true },
    }),
    // Group by status with leadWhere
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhere,
      _count: { _all: true },
    }),
    // Division counts across the entire lead pool (or filtered by selectedSource)
    prisma.lead.groupBy({
      by: ["division"],
      where: { ...(selectedSource ? { source: selectedSource } : {}), ...repScope, ...companyScope },
      _count: { _all: true },
    }),
    // Unassigned leads counts for the Allotment Desk
    prisma.lead.groupBy({
      by: ["division"],
      where: { assignedEmployeeId: null, ...companyScope },
      _count: { _all: true },
    }),
    // Unassigned Excel batches for allotment desk
    prisma.lead.groupBy({
      by: ["sourceTag"],
      where: {
        source: LeadSource.EXCEL_IMPORT,
        assignedEmployeeId: null,
        sourceTag: { not: null },
        ...companyScope,
      },
      _count: { _all: true },
    }),
    activeCompanyId
      ? prisma.companySettings.findFirst({
          where: { companyId: activeCompanyId },
        })
      : prisma.companySettings.findFirst({
          where: { id: "default" },
        }),
    prisma.leadSourceAssignment.findMany({
      where: companyScope,
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Source count mapping
  const sourceCountMap = new Map(
    sourceCounts.map((item) => [item.source, item._count._all])
  );
  const totalPlatformLeadCount = sourceCounts.reduce(
    (sum, item) => sum + item._count._all,
    0
  );

  // Determine dynamically active sources based on API credentials and existing leads
  const isSourceActive = (sourceValue: LeadSource) => {
    const count = sourceCountMap.get(sourceValue) ?? 0;
    switch (sourceValue) {
      case LeadSource.META:
        return Boolean(settings?.metaAccessToken || settings?.metaAppId || settings?.metaApiKey || count > 0);
      case LeadSource.EXCEL_IMPORT:
        return Boolean((settings?.enableBulkExcelUpload ?? true) || count > 0);
      case LeadSource.INDIAMART:
        return Boolean(settings?.indiaMartApiKey || count > 0);
      case LeadSource.WHATSAPP:
        return Boolean((settings?.metaPhoneNumberId && settings?.metaAccessToken) || count > 0);
      case LeadSource.WEBSITE:
        return count > 0;
      case LeadSource.SOCIAL:
        return count > 0;
      case LeadSource.MANUAL:
        return count > 0;
      default:
        return count > 0;
    }
  };

  // WhatsApp and Social are hidden everywhere in Lead Center (cards, dropdowns, source setup).
  // Leads that already came from them stay in the database and in the table.
  const HIDDEN_SOURCES: LeadSource[] = [LeadSource.WHATSAPP, LeadSource.SOCIAL];
  const activeLeadSources = leadSources.filter(
    (s) => isSourceActive(s.value) && !HIDDEN_SOURCES.includes(s.value)
  );
  const platformCardSources = activeLeadSources;
  const visibleLeadSources = leadSources.filter((s) => !HIDDEN_SOURCES.includes(s.value));

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: e.name,
    leadCount: e._count.leads,
  }));

  const assignmentsBySource = new Map<
    LeadSource,
    { id: string; employeeId: string; employeeName: string }[]
  >();
  for (const a of sourceAssignments) {
    const list = assignmentsBySource.get(a.source) || [];
    list.push({ id: a.id, employeeId: a.employeeId, employeeName: a.employee.name });
    assignmentsBySource.set(a.source, list);
  }

  // Map division counts
  const divisionCountMap = new Map(
    divisionStats.map((d) => [d.division || "PCD_FRANCHISE", d._count._all])
  );
  const pcdCount = divisionCountMap.get("PCD_FRANCHISE") ?? 0;
  const thirdPartyCount = divisionCountMap.get("THIRD_PARTY") ?? 0;

  // Unassigned breakdown for allotment desk
  const unassignedMap = new Map(
    unassignedDivisionStats.map((d) => [d.division || "PCD_FRANCHISE", d._count._all])
  );
  const pcdUnassigned = unassignedMap.get("PCD_FRANCHISE") ?? 0;
  const tpUnassigned = unassignedMap.get("THIRD_PARTY") ?? 0;
  const totalUnassigned = pcdUnassigned + tpUnassigned;
  const unassignedInScope =
    selectedDivision === "PCD_FRANCHISE" ? pcdUnassigned : selectedDivision === "THIRD_PARTY" ? tpUnassigned : totalUnassigned;

  // Status mapping
  const statusCountMap = new Map(
    statusCounts.map((item) => [item.status, item._count._all])
  );

  // Client-side search filtering if search query exists
  const filteredLeads = search
    ? leads.filter((l) => {
        const name = (l.name || "").toLowerCase();
        const phone = (l.phoneNumber || "").toLowerCase();
        const notes = (extractLeadData(l.rawPayload) || l.inquiryDetails || "").toLowerCase();
        const rep = (l.assignedEmployee?.name || "").toLowerCase();
        return (
          name.includes(search) ||
          phone.includes(search) ||
          notes.includes(search) ||
          rep.includes(search)
        );
      })
    : leads;

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * LEADS_PER_PAGE,
    currentPage * LEADS_PER_PAGE
  );

  const selectedPlatform =
    activeLeadSources.find((source) => source.value === selectedSource) ||
    leadSources.find((source) => source.value === selectedSource);

  // URL Helper preserving filter parameters
  const buildLeadsUrl = (overrides: {
    source?: string | null;
    division?: string | null;
    search?: string | null;
    page?: number | null;
    unassigned?: boolean;
  }) => {
    const s = overrides.source !== undefined ? overrides.source : (params?.source || null);
    const d = overrides.division !== undefined ? overrides.division : selectedDivision;
    const q = overrides.search !== undefined ? overrides.search : (params?.search || "");
    const onlyUnassigned = overrides.unassigned !== undefined ? overrides.unassigned : unassignedOnly;
    const filterChanged =
      overrides.unassigned !== undefined ||
      overrides.source !== undefined ||
      overrides.division !== undefined ||
      overrides.search !== undefined;
    const page = overrides.page !== undefined
      ? overrides.page
      : filterChanged
        ? 1
        : currentPage;

    const sp = new URLSearchParams();
    if (s && s !== "all") sp.set("source", s);
    if (d && d !== "ALL") sp.set("division", d);
    if (onlyUnassigned) sp.set("unassigned", "1");
    else if (repFilterId) sp.set("employeeId", repFilterId);
    if (q && q.trim()) sp.set("search", q.trim());
    if (params?.range) sp.set("range", params.range);
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (page && page > 1) sp.set("page", page.toString());

    const qs = sp.toString();
    return qs ? `/admin/leads?${qs}` : "/admin/leads";
  };

  return (
    <div className="flex flex-col gap-7">
      {repFilterId && !unassignedOnly && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900">
          Showing only <strong>{employees.find((e) => e.id === repFilterId)?.name ?? "this representative"}</strong>&apos;s leads
          <Link href="/admin/leads" className="ml-auto text-xs font-bold text-sky-700 underline">
            Show everyone
          </Link>
        </div>
      )}

      {/* Top Banner */}
      <section className="order-1 relative overflow-hidden rounded-3xl px-7 py-6 neo-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Allota Lead{" "}
              <span className="bg-[linear-gradient(135deg,#38bdf8,#a855f7_52%,#fb923c)] bg-clip-text text-transparent [filter:drop-shadow(2px_3px_4px_rgba(15,23,42,0.18))]">
                IQ
              </span>
            </h1>
            {selectedPlatform && (
              <span className="neo-pressed px-3 py-1 text-xs font-bold text-ink-muted">
                Channel: {selectedPlatform.label}
              </span>
            )}
          </div>

          {/* Commercial category filter */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { value: "ALL", label: "All", icon: "📋", count: pcdCount + thirdPartyCount, active: "bg-slate-200 text-slate-800 border-slate-300", idle: "text-slate-800 border-slate-200 hover:bg-slate-50", pill: "bg-slate-100 text-slate-800" },
                { value: "PCD_FRANCHISE", label: "PCD Pharma Franchise", icon: "🏢", count: pcdCount, active: "bg-blue-100 text-blue-800 border-blue-300", idle: "text-blue-900 border-blue-200 hover:bg-blue-50/60", pill: "bg-blue-100 text-blue-800" },
                { value: "THIRD_PARTY", label: "Third-Party Manufacturing", icon: "🏭", count: thirdPartyCount, active: "bg-purple-100 text-purple-800 border-purple-300", idle: "text-purple-900 border-purple-200 hover:bg-purple-50/60", pill: "bg-purple-100 text-purple-800" },
              ] as const
            ).map((opt) => {
              const isActive = selectedDivision === opt.value;
              return (
                <Link
                  key={opt.value}
                  href={buildLeadsUrl({ division: opt.value })}
                  className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition ${
                    isActive ? opt.active : `bg-white ${opt.idle}`
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold ${
                      isActive ? "bg-white/70 text-inherit" : opt.pill
                    }`}
                  >
                    {opt.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 1. Branded Platform Navigation Cards - Dynamic Active Sources Only */}
      <section className={`order-2 grid gap-4 sm:grid-cols-2 md:grid-cols-3 ${
        platformCardSources.length <= 2
          ? "xl:grid-cols-3"
          : platformCardSources.length <= 3
          ? "xl:grid-cols-4"
          : platformCardSources.length <= 5
          ? "xl:grid-cols-6"
          : "xl:grid-cols-8"
      }`}>
        <PlatformCard
          href={buildLeadsUrl({ source: "all" })}
          label="All Platforms"
          detail={selectedDivision === "PCD_FRANCHISE" ? "All PCD Inquiries" : selectedDivision === "THIRD_PARTY" ? "All Third-Party" : "All Inquiries"}
          count={totalPlatformLeadCount}
          active={!selectedSource}
          brandColor="all"
        />
        {platformCardSources.map((source) => (
          <PlatformCard
            key={source.value}
            href={buildLeadsUrl({ source: source.value })}
            label={source.shortLabel}
            detail={source.detail}
            count={sourceCountMap.get(source.value) ?? 0}
            active={selectedSource === source.value}
            brandColor={source.value}
          />
        ))}
      </section>

      {/* Temporarily hidden until Social Signals gets its own main navigation area. */}
      {SHOW_LEAD_CENTER_INSIGHTS && (
      <section className="order-4 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl p-6 neo-panel">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-ink text-base">Pipeline Velocity</h2>
              <p className="text-xs text-ink-faint mt-0.5">
                Stage progression for{" "}
                <strong className="text-ink">
                  {divisionLabel}
                </strong>{" "}
                via {selectedPlatform?.shortLabel ?? "all channels"}.
              </p>
            </div>
            <span className="text-xs font-bold text-ink bg-slate-100 rounded-full px-3 py-1 border border-line">
              {filteredLeads.length} leads in stage
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leadStatuses.map((status) => {
              const statusTheme = getStatusCardTheme(status);
              return (
                <div
                  key={status}
                  className={`rounded-2xl p-4 neo-pressed border-l-4 ${statusTheme.border} transition hover:bg-white`}
                >
                  <p className="text-2xl font-extrabold text-ink">
                    {statusCountMap.get(status) ?? 0}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusTheme.dot}`} />
                    <p className="text-xs font-bold text-ink-muted">
                      {formatStatus(status)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* AI Social Watchlist (strictly scoped to after-hours DM/comment response) */}
        <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-pink-500">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
              <h2 className="font-bold text-ink text-base">
                Social Lead Watchlist & After-Hours AI
              </h2>
            </div>
            <span className="rounded-full bg-pink-50 border border-pink-200 px-2.5 py-0.5 text-[10px] font-bold text-pink-700">
              8:00 PM – 9:00 AM Active
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Automated replies to DMs and post comments outside office hours — sharing PCD franchise
            brochures and collecting prospect phone numbers.
          </p>
          <div className="mt-4 grid gap-2.5">
            <WatchItem
              label="After-Hours Meta Ads DMs"
              value="Auto-shares PDF product list & collects DL / GST"
              tone="blue"
            />
            <WatchItem
              label="Instagram Post Comments"
              value="Instant direct reply: 'Check inbox for monopoly terms'"
              tone="indigo"
            />
            <WatchItem
              label="WhatsApp Inbound Routing"
              value="Auto-greets buyer and places in Rep assignment queue"
              tone="emerald"
            />
          </div>
        </section>
      </section>
      )}

      {/* 4.5 Lead Sources & Auto-Assignment (compact, one card per channel) */}
      <section className="order-7 rounded-3xl p-6 neo-panel bg-white">
        <div className="-mx-6 -mt-6 mb-5 rounded-t-3xl border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-6 py-4">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">Lead Sources & Auto-Assignment</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleLeadSources.map((source) => {
            const connected = isSourceActive(source.value);
            const assigned = assignmentsBySource.get(source.value) || [];
            const assignedIds = new Set(assigned.map((a) => a.employeeId));
            const availableEmployees = employeeOptions.filter((e) => !assignedIds.has(e.id));
            const count = sourceCountMap.get(source.value) || 0;

            return (
              <div
                key={source.value}
                className={`rounded-2xl border p-4 transition ${
                  connected ? "bg-white border-line" : "bg-slate-50 border-line-soft opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SourceIcon source={source.value} className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-bold text-ink">{source.shortLabel}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      connected
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-200 text-ink-faint"
                    }`}
                  >
                    {connected ? "● Connected" : "Not Connected"}
                  </span>
                </div>

                {connected ? (
                  <>
                    <p className="text-[11px] text-ink-muted mb-2">{count} inquiries</p>
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] font-bold text-primary underline decoration-dotted select-none">
                        {assigned.length > 0
                          ? `${assigned.length} rep${assigned.length > 1 ? "s" : ""} assigned — Edit`
                          : "Assign reps"}
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {assigned.map((a) => (
                          <form
                            key={a.id}
                            action={removeSourceEmployeeMapping}
                            className="flex items-center justify-between rounded-lg bg-slate-50 border border-line-soft px-2 py-1"
                          >
                            <input type="hidden" name="mappingId" value={a.id} />
                            <span className="text-[11px] font-semibold text-ink">{a.employeeName}</span>
                            <button
                              type="submit"
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                            >
                              Remove
                            </button>
                          </form>
                        ))}
                        {availableEmployees.length > 0 && (
                          <form action={addSourceEmployeeMapping} className="flex items-center gap-1">
                            <input type="hidden" name="source" value={source.value} />
                            <select
                              name="employeeId"
                              required
                              defaultValue=""
                              className="h-7 flex-1 rounded-lg border border-line bg-white px-1.5 text-[10px] font-semibold text-ink focus:outline-none"
                            >
                              <option value="" disabled>
                                Add rep...
                              </option>
                              {availableEmployees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="h-7 shrink-0 rounded-lg bg-primary px-2 text-[10px] font-bold text-white hover:bg-primary-strong transition cursor-pointer"
                            >
                              Add
                            </button>
                          </form>
                        )}
                      </div>
                    </details>
                  </>
                ) : (
                  <Link
                    href="/admin/settings"
                    className="text-[10px] font-bold text-ink-faint hover:text-primary transition"
                  >
                    Connect in Settings →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4.6 Bulk Excel / CSV Ingestor */}
      <section className="order-8">
        <ExcelUploader employees={employeeOptions} />
      </section>

      {/* 5. FULL-WIDTH Master Leads Table (No blank space on the left) */}
      <section
        id="master-leads"
        className="order-5 scroll-mt-24 overflow-hidden rounded-3xl neo-panel bg-white"
      >
        <div className="border-b border-line px-6 py-5 flex flex-col gap-4 bg-slate-50/50">
          {/* Search Bar + Quick Actions */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 ">
            <form method="GET" action="/admin/leads" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-nowrap">
              <input type="hidden" name="source" value={selectedSource ?? "all"} />
              <input type="hidden" name="division" value={selectedDivision} />
              {unassignedOnly && <input type="hidden" name="unassigned" value="1" />}
              {repFilterId && !unassignedOnly && <input type="hidden" name="employeeId" value={repFilterId} />}
              {params?.range && <input type="hidden" name="range" value={params.range} />}
              {params?.from && <input type="hidden" name="from" value={params.from} />}
              {params?.to && <input type="hidden" name="to" value={params.to} />}
              <div className="relative min-w-44 flex-1 sm:flex-initial">
                <input
                  type="text"
                  name="search"
                  defaultValue={search}
                  placeholder="Search leads, phone, notes..."
                  className="w-full sm:w-64 rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-ink neo-button hover:text-primary transition"
              >
                Search
              </button>
              {search && (
                <Link
                  href={buildLeadsUrl({ search: "" })}
                  className="text-xs text-rose-600 hover:underline shrink-0 font-medium"
                >
                  Clear
                </Link>
              )}
            </form>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {selectedSource && (
                <Link
                  href={buildLeadsUrl({ source: "all" })}
                  className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition shrink-0"
                >
                  Clear Platform
                </Link>
              )}

              {unassignedOnly && (
                <Link
                  href={buildLeadsUrl({ unassigned: false })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 shrink-0"
                >
                  ← All Leads
                </Link>
              )}
              <Link
                href={buildLeadsUrl({ unassigned: !unassignedOnly })}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition shrink-0 ${
                  unassignedOnly
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
              >
                {unassignedInScope} Unassigned
              </Link>
            <AssignLeadsModal>
            <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-teal-500 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse" />
                    <h2 className="font-bold text-ink text-base">
                      ⚡ Quick Leads Allotment Desk
                    </h2>
                  </div>
                </div>
                <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-3.5 py-1 text-xs font-bold self-start max-w-full sm:shrink-0">
                  {totalUnassigned} Unassigned Inquiries ({pcdUnassigned} PCD / {tpUnassigned} Third-Party)
                </span>
              </div>

              {/* 100% Full-Width Form, Perfectly Aligned Row, Zero Blank Space */}
              <form action={allotLeadsBatch} className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5 whitespace-nowrap">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min={1}
                    max={totalUnassigned || 500}
                    defaultValue={Math.min(50, totalUnassigned || 50)}
                    required
                    className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                    placeholder="e.g. 50"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5 whitespace-nowrap">
                    Assign To Employee *
                  </label>
                  <select
                    name="employeeId"
                    required
                    className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  >
                    <option value="">Select Employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp._count.leads} active leads / {emp._count.clients} clients)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5 whitespace-nowrap">
                    Category Pool *
                  </label>
                  <select
                    name="division"
                    defaultValue={selectedDivision}
                    className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  >
                    <option value="PCD_FRANCHISE">PCD Only ({pcdUnassigned})</option>
                    <option value="THIRD_PARTY">Third-Party ({tpUnassigned})</option>
                    <option value="ALL">Both Pools ({totalUnassigned})</option>
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5 whitespace-nowrap">
                    Source Channel / Batch *
                  </label>
                  <select
                    name="source"
                    defaultValue={selectedSource || "ALL"}
                    className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  >
                    <option value="ALL">All Active Channels</option>
                    {activeLeadSources.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                    {unassignedExcelBatches.length > 0 && (
                      <optgroup label="Specific Excel Batches">
                        {unassignedExcelBatches.map((batch) => (
                          <option key={batch.sourceTag} value={`BATCH:${batch.sourceTag}`}>
                            Batch: {batch.sourceTag} ({batch._count._all} unassigned)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-500/20 hover:from-teal-700 hover:to-emerald-700 transition cursor-pointer"
                  >
                    <span>⚡</span>
                    <span className="whitespace-nowrap">Assign Leads</span>
                  </button>
                </div>
              </form>

              {/* Collapsible Manual Single-Lead Simulator (Zero vertical bloat when closed) */}
              <details className="mt-5 pt-4 border-t border-line group">
                <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-ink-muted hover:text-ink transition select-none list-none">
                  <div className="flex items-center gap-2">
                    <span className="text-xs transition-transform group-open:rotate-90">▶</span>
                    <span>➕ Need to register a single lead manually? (API Simulator)</span>
                  </div>
                  <span className="text-[11px] font-normal text-ink-faint">Click to expand single entry form</span>
                </summary>

                <form action={createLead} className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Lead Source
                    </label>
                    <select
                      name="source"
                      defaultValue={selectedSource ?? (activeLeadSources[0]?.value || LeadSource.MANUAL)}
                      className={inputClass}
                    >
                      {activeLeadSources.map((source) => (
                        <option key={source.value} value={source.value}>
                          {source.label}
                        </option>
                      ))}
                      {!activeLeadSources.some((s) => s.value === LeadSource.MANUAL) && (
                        <option value={LeadSource.MANUAL}>Manual Entry</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Category
                    </label>
                    <select name="division" defaultValue={selectedDivision === "THIRD_PARTY" ? "THIRD_PARTY" : "PCD_FRANCHISE"} className={inputClass}>
                      <option value="PCD_FRANCHISE">PCD Franchise</option>
                      <option value="THIRD_PARTY">Third-Party Mfg</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Prospect / Entity Name *
                    </label>
                    <input
                      name="name"
                      required
                      placeholder="e.g. Apex Pharma Agencies"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Phone Number
                    </label>
                    <input
                      name="phoneNumber"
                      placeholder="+91 98765 43210"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Assign Representative
                    </label>
                    <select name="assignedEmployeeId" defaultValue="" className={inputClass}>
                      <option value="">Keep unassigned</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Inquiry Details & Target Salts
                    </label>
                    <input
                      name="notes"
                      placeholder="City monopoly, salts needed, budget"
                      className={inputClass}
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full h-11 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-xs hover:bg-black transition cursor-pointer"
                    >
                      Add Lead
                    </button>
                  </div>
                </form>
              </details>
            </section>
            </AssignLeadsModal>
              <a
                href={`/api/admin/leads/export?division=${selectedDivision}${selectedSource ? `&source=${selectedSource}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                download
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs shrink-0 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export to Excel (.xlsx)
              </a>
            </div>
          </div>
        </div>

        {/* Desktop Full-Width Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-6 py-3.5">Lead & Contact</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Platform</th>
                <th className="px-6 py-3.5">Assigned Representative</th>
                <th className="px-6 py-3.5">Calls</th>
                <th className="px-6 py-3.5">Remarks</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {paginatedLeads.map((lead) => {
                const sourceMeta = leadSources.find((s) => s.value === lead.source);
                const isPcd = (lead.division || "PCD_FRANCHISE") === "PCD_FRANCHISE";

                return (
                  <tr key={lead.id} className="hover:bg-slate-50/60 transition">
                    {/* Lead & Contact */}
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        {!lead.assignedEmployeeId && (
                          <span title="Unassigned" aria-label="Unassigned lead" className="mb-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
                        )}
                        <p className="font-bold text-ink text-sm">
                          {lead.name ?? "Unnamed Prospect"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-mono text-ink-muted">
                            {lead.phoneNumber ?? "No phone recorded"}
                          </p>
                        </div>
                        <p className="text-[10px] text-ink-faint">
                          Received: {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </td>

                    {/* Category (PCD Franchise vs Third-Party) */}
                    <td className="px-6 py-4">
                      {isPcd ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-800">
                          <span>🏢</span>
                          <span>PCD Franchise</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-bold text-purple-800">
                          <span>🏭</span>
                          <span>Third-Party</span>
                        </span>
                      )}
                    </td>

                    {/* Platform / Source */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold neo-pressed border border-line text-ink">
                        <span className="flex items-center justify-center shrink-0">{getSourceIconComponent(lead.source)}</span>
                        <span>{sourceMeta?.shortLabel ?? lead.source}</span>
                      </span>
                    </td>

                    {/* Assigned Representative */}
                    <td className="px-6 py-4">
                      <form action={updateLead} className="flex items-center gap-1.5">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="status" value={lead.status} />
                        <select
                          key={`${lead.id}-${lead.assignedEmployeeId ?? "none"}`}
                          name="assignedEmployeeId"
                          defaultValue={lead.assignedEmployeeId ?? ""}
                          className={lead.assignedEmployeeId ? tableSelectClass : tableSelectUnassignedClass}
                        >
                          <option value="">Unassigned</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                          {lead.assignedEmployee && !employees.some((e) => e.id === lead.assignedEmployeeId) && (
                            <option value={lead.assignedEmployee.id}>{lead.assignedEmployee.name}</option>
                          )}
                        </select>
                        <button type="submit" className={smallButtonClass}>
                          Save
                        </button>
                      </form>
                    </td>

                    {/* Calls */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-ink">
                        <span>📞</span>
                        <span>{lead._count.calls}</span>
                      </span>
                    </td>

                    {/* Remarks (opens the full history page) */}
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/lead-history/${lead.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                        title={lead.remarks[0]?.remark ?? "No remarks yet"}
                      >
                        <span>📝 Remarks</span>
                        <span className="text-[10px] text-amber-700">({lead.remarks.length})</span>
                      </Link>
                    </td>

                    {/* Status: Active (green) / Dead (red), as chosen by the employee */}
                    <td className="px-6 py-4">
                      {lead.status === LeadStatus.NOT_INTERESTED ? (
                        <Link
                          href={`/admin/lead-history/${lead.id}`}
                          title="Marked dead by the representative. Open full history"
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                        >
                          <span className="h-2 w-2 rounded-full bg-rose-500" />
                          Dead
                        </Link>
                      ) : (
                        <span
                          title="Marked active by the representative"
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!filteredLeads.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-ink-faint">
                    No inquiries matched your criteria. Try changing the commercial filter or clearing search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch Cards View (lg:hidden) */}
        <div className="lg:hidden divide-y divide-line-soft">
          {paginatedLeads.map((lead) => {
            const cleanPhone = (lead.phoneNumber || "").replace(/[^0-9]/g, "");
            const isPcd = (lead.division || "PCD_FRANCHISE") === "PCD_FRANCHISE";
            const leadDataText = extractLeadData(lead.rawPayload) || lead.inquiryDetails || "Inquiry recorded via API";

            return (
              <div key={lead.id} className="p-4 space-y-3">
                {/* Lead Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {!lead.assignedEmployeeId && (
                      <span title="Unassigned" aria-label="Unassigned lead" className="mb-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
                    )}
                    <h3 className="font-extrabold text-ink text-base">
                      {lead.name ?? "Unnamed Prospect"}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-muted">
                      <span>{lead.phoneNumber ?? "No phone recorded"}</span>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                      isPcd
                        ? "bg-blue-100 text-blue-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {isPcd ? "🏢 PCD Franchise" : "🏭 Third-Party"}
                  </span>
                </div>

                {/* Source & Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink bg-slate-100 px-2.5 py-1 rounded-lg">
                    <span className="flex items-center justify-center shrink-0">{getSourceIconComponent(lead.source)}</span>
                    <span>{lead.source}</span>
                  </span>

                  {cleanPhone && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700 active:bg-blue-100"
                      >
                        📞 Call
                      </a>
                    </div>
                  )}
                </div>

                {/* Inquiry notes */}
                <p className="text-xs text-ink-muted bg-slate-50 p-2.5 rounded-xl border border-line-soft leading-relaxed">
                  {leadDataText}
                </p>

                {/* Employee Remarks on Mobile */}
                {lead.remarks.length > 0 && (
                  <details className="group">
                    <summary className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 cursor-pointer select-none">
                      📝 Remarks ({lead.remarks.length})
                    </summary>
                    <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-line-soft bg-slate-50 p-2">
                      {lead.remarks.map((r) => (
                        <div key={r.id} className="text-[11px] leading-relaxed">
                          <p className="text-ink">{r.remark}</p>
                          <p className="text-[10px] text-ink-faint font-semibold">
                            — {r.employee.name}, {new Date(r.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Rep Assignment & Stage Form on Mobile */}
                <div className="space-y-2 pt-1 border-t border-line-soft">
                  <form action={updateLead} className="flex items-center justify-between gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="status" value={lead.status} />
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold uppercase text-ink-faint mb-0.5">
                        Assigned Rep:
                      </label>
                      <select
                        key={`${lead.id}-${lead.assignedEmployeeId ?? "none"}`}
                        name="assignedEmployeeId"
                        defaultValue={lead.assignedEmployeeId ?? ""}
                        className={`w-full h-8 rounded-lg border px-2 text-xs font-medium ${
                          lead.assignedEmployeeId
                            ? "border-line bg-white text-ink"
                            : "border-rose-200 bg-gradient-to-r from-amber-50 to-rose-100 text-rose-800"
                        }`}
                      >
                        <option value="">Unassigned</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                        {lead.assignedEmployee && !employees.some((e) => e.id === lead.assignedEmployeeId) && (
                          <option value={lead.assignedEmployee.id}>{lead.assignedEmployee.name}</option>
                        )}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="self-end h-8 rounded-lg bg-slate-100 hover:bg-primary hover:text-white px-2.5 text-xs font-bold text-ink cursor-pointer"
                    >
                      Assign
                    </button>
                  </form>

                  <form action={updateLead} className="flex items-center justify-between gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input
                      type="hidden"
                      name="assignedEmployeeId"
                      value={lead.assignedEmployeeId ?? ""}
                    />
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold uppercase text-ink-faint mb-0.5">
                        Pipeline Stage:
                      </label>
                      <select
                        name="status"
                        defaultValue={lead.status}
                        className="w-full h-8 rounded-lg border border-line bg-white px-2 text-xs font-medium text-ink"
                      >
                        {leadStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="self-end h-8 rounded-lg bg-slate-100 hover:bg-primary hover:text-white px-2.5 text-xs font-bold text-ink cursor-pointer"
                    >
                      Update
                    </button>
                  </form>
                </div>
              </div>
            );
          })}

          {!filteredLeads.length && (
            <div className="p-8 text-center text-sm text-ink-faint">
              No inquiries matched your criteria.
            </div>
          )}
        </div>

        {filteredLeads.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-ink-muted">
              Showing {(currentPage - 1) * LEADS_PER_PAGE + 1}–{Math.min(currentPage * LEADS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length} leads
            </p>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={buildLeadsUrl({ page: currentPage - 1 })}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-primary/40 hover:text-primary transition"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="rounded-xl border border-line-soft bg-slate-100 px-3 py-1.5 text-xs font-bold text-ink-faint">
                  ← Previous
                </span>
              )}
              <span className="px-2 text-xs font-bold text-ink">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link
                  href={buildLeadsUrl({ page: currentPage + 1 })}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-primary/40 hover:text-primary transition"
                >
                  Next →
                </Link>
              ) : (
                <span className="rounded-xl border border-line-soft bg-slate-100 px-3 py-1.5 text-xs font-bold text-ink-faint">
                  Next →
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-primary/40 transition";

const tableSelectClass =
  "w-full min-w-36 rounded-xl border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm";

const tableSelectUnassignedClass =
  "w-full min-w-36 rounded-xl border border-rose-200 bg-gradient-to-r from-amber-50 to-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-300/50 shadow-sm";

const smallButtonClass =
  "w-fit rounded-xl px-3 py-1.5 text-xs font-bold text-ink-muted neo-button hover:text-primary hover:border-primary/40";

function getSourceIconComponent(source: string, active?: boolean) {
  switch (source) {
    case LeadSource.META:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill={active ? "currentColor" : "#0467DF"}>
          <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
        </svg>
      );
    case LeadSource.INDIAMART:
      return (
        <img
          src="/indiamart-icon.png"
          alt="IndiaMART"
          className="h-3.5 w-3.5 rounded-xs object-contain shrink-0"
        />
      );
    case LeadSource.WEBSITE:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2" />
          <path d="M3 12h18M12 3a14.5 14.5 0 0 1 4 9 14.5 14.5 0 0 1-4 9 14.5 14.5 0 0 1-4-9 14.5 14.5 0 0 1 4-9z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case LeadSource.WHATSAPP:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill={active ? "currentColor" : "#25D366"}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      );
    case LeadSource.SOCIAL:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill={active ? "currentColor" : "#E1306C"}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case LeadSource.MANUAL:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="19" y1="8" x2="19" y2="14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="22" y1="11" x2="16" y2="11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case LeadSource.EXCEL_IMPORT:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 2290 2130" fill="none">
          <path fill="#185C37" d="M1437.75 1011.75L532.5 852v1180.39c0 53.91 43.7 97.61 97.61 97.61h1562.04c53.9 0 97.6-43.7 97.6-97.61V1597.5L1437.75 1011.75z"/>
          <path fill="#21A366" d="M1437.75 0H630.11C576.2 0 532.5 43.7 532.5 97.61V532.5l905.25 532.5 479.25 159.75 372.75-159.75V532.5L1437.75 0z"/>
          <path fill="#107C41" d="M532.5 532.5h905.25V1065H532.5V532.5z"/>
          <path fill="#33C481" d="M2192.14 0H1437.75v532.5h852V97.61c0-53.91-43.7-97.61-97.61-97.61z"/>
          <path fill="#107C41" d="M1437.75 1065h852v532.5h-852V1065z"/>
          <path fill="#18884F" d="M97.61 479.25h976.28c53.91 0 97.61 43.7 97.61 97.61v976.28c0 53.91-43.7 97.61-97.61 97.61H97.61C43.7 1650.75 0 1607.05 0 1553.14V576.86C0 522.95 43.7 479.25 97.61 479.25z"/>
          <path fill="#FFFFFF" d="M302.3 1382.26l205.33-318.17L319.5 747.68h151.34l102.66 202.35c9.48 19.23 15.98 33.5 19.49 42.92h1.33c6.75-15.33 13.85-30.23 21.3-44.67L725.37 747.8h138.93l-192.93 314.55 197.83 319.91H721.38L602.79 1160.16c-5.59-9.45-10.33-19.38-14.16-29.66h-1.76c-3.47 10.07-8.08 19.72-13.74 28.75l-122.1 223.01H302.3z"/>
        </svg>
      );
    default:
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>
      );
  }
}

function PlatformCard({
  href,
  label,
  detail,
  count,
  active,
  brandColor,
}: {
  href: string;
  label: string;
  detail: string;
  count: number;
  active: boolean;
  brandColor: string;
}) {
  const brandStyles: Record<string, { active: string; inactive: string; countColor: string; iconBadge: string }> = {
    all: {
      active: "bg-gradient-to-br from-primary to-primary-strong text-white shadow-lg shadow-primary/25",
      inactive: "border-l-4 border-l-primary hover:border-primary",
      countColor: "text-primary",
      iconBadge: "bg-sky-50 text-sky-600 border border-sky-200/60",
    },
    [LeadSource.META]: {
      active: "bg-gradient-to-br from-[#0467DF] to-blue-700 text-white shadow-lg shadow-blue-600/25",
      inactive: "border-l-4 border-l-[#0467DF] hover:border-blue-400",
      countColor: "text-[#0467DF]",
      iconBadge: "bg-blue-50 text-[#0467DF] border border-blue-200/60",
    },
    [LeadSource.INDIAMART]: {
      active: "bg-gradient-to-br from-[#283593] to-[#1a237e] text-white shadow-lg shadow-indigo-900/25",
      inactive: "border-l-4 border-l-[#283593] hover:border-indigo-600",
      countColor: "text-[#283593]",
      iconBadge: "bg-indigo-50 text-[#283593] border border-indigo-200/60",
    },
    [LeadSource.WEBSITE]: {
      active: "bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-600/25",
      inactive: "border-l-4 border-l-purple-500 hover:border-purple-400",
      countColor: "text-purple-600",
      iconBadge: "bg-purple-50 text-purple-600 border border-purple-200/60",
    },
    [LeadSource.WHATSAPP]: {
      active: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25",
      inactive: "border-l-4 border-l-[#25D366] hover:border-emerald-400",
      countColor: "text-[#25D366]",
      iconBadge: "bg-emerald-50 text-[#25D366] border border-emerald-200/60",
    },
    [LeadSource.SOCIAL]: {
      active: "bg-gradient-to-br from-rose-500 via-pink-600 to-purple-600 text-white shadow-lg shadow-rose-500/25",
      inactive: "border-l-4 border-l-rose-500 hover:border-rose-400",
      countColor: "text-[#E1306C]",
      iconBadge: "bg-rose-50 text-[#E1306C] border border-rose-200/60",
    },
    [LeadSource.MANUAL]: {
      active: "bg-gradient-to-br from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-600/25",
      inactive: "border-l-4 border-l-amber-500 hover:border-amber-400",
      countColor: "text-amber-600",
      iconBadge: "bg-amber-50 text-amber-600 border border-amber-200/60",
    },
    [LeadSource.EXCEL_IMPORT]: {
      active: "bg-gradient-to-br from-[#107C41] to-[#0d6133] text-white shadow-lg shadow-emerald-900/25",
      inactive: "border-l-4 border-l-[#107C41] hover:border-emerald-600",
      countColor: "text-[#107C41]",
      iconBadge: "bg-emerald-50 text-[#107C41] border border-emerald-200/60",
    },
  };

  const currentTheme = brandStyles[brandColor] ?? brandStyles.all;

  return (
    <Link
      href={href}
      scroll={false}
      className={
        active
          ? `rounded-3xl p-4 sm:p-5 ${currentTheme.active} transition-all duration-200 transform scale-[1.02]`
          : `rounded-3xl p-4 sm:p-5 neo-panel-soft ${currentTheme.inactive} transition-all duration-200 hover:-translate-y-1 hover:shadow-md`
      }
    >
      <div className="flex items-center justify-between gap-1.5">
        <p className={`text-2xl font-black ${active ? "text-white" : currentTheme.countColor}`}>
          {count}
        </p>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs shrink-0 transition ${
            active
              ? "bg-white/20 text-white shadow-xs"
              : currentTheme.iconBadge
          }`}
          title={label}
        >
          {getSourceIconComponent(brandColor, active)}
        </span>
      </div>
      <p
        className={`mt-2 text-sm font-bold truncate ${
          active ? "text-white" : "text-ink"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-[11px] line-clamp-2 leading-relaxed ${
          active ? "text-white/80" : "text-ink-faint"
        }`}
      >
        {detail}
      </p>
    </Link>
  );
}

function WatchItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "indigo" | "emerald";
}) {
  const toneClasses = {
    blue: "border-l-4 border-l-blue-500 bg-blue-50/40",
    indigo: "border-l-4 border-l-indigo-500 bg-indigo-50/40",
    emerald: "border-l-4 border-l-emerald-500 bg-emerald-50/40",
  };

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl p-3.5 neo-pressed ${toneClasses[tone]}`}>
      <p className="text-xs font-bold text-ink">{label}</p>
      <p className="text-xs text-ink-muted font-medium">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
      {label}
      {children}
    </label>
  );
}

function formatStatus(status: LeadStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function getStatusCardTheme(status: LeadStatus) {
  switch (status) {
    case LeadStatus.NEW:
      return { border: "border-l-purple-500", dot: "bg-purple-500" };
    case LeadStatus.ASSIGNED:
      return { border: "border-l-indigo-500", dot: "bg-indigo-500" };
    case LeadStatus.CONTACTED:
      return { border: "border-l-blue-500", dot: "bg-blue-500" };
    case LeadStatus.INTERESTED:
      return { border: "border-l-teal-500", dot: "bg-teal-500" };
    case LeadStatus.NOT_INTERESTED:
      return { border: "border-l-rose-500", dot: "bg-rose-500" };
    case LeadStatus.CONVERTED:
      return { border: "border-l-emerald-500", dot: "bg-emerald-500" };
    default:
      return { border: "border-l-slate-400", dot: "bg-slate-400" };
  }
}

function extractLeadData(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const payload = rawPayload as Record<string, unknown>;
  const preferredKeys = [
    "notes",
    "formName",
    "adName",
    "campaignName",
    "commentText",
    "messageText",
    "pageName",
  ];

  for (const key of preferredKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return Object.entries(payload)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");
}
