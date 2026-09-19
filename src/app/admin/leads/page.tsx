import Link from "next/link";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { allotLeadsBatch, createLead, updateLead } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

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

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    source?: string;
    division?: string;
    search?: string;
    range?: string;
    from?: string;
    to?: string;
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

  const selectedDivision =
    params?.division === "THIRD_PARTY" ? "THIRD_PARTY" : "PCD_FRANCHISE";

  const search = (params?.search || "").trim().toLowerCase();

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  // Base where clause for filtering leads table and pipeline status
  const leadWhere: Record<string, any> = {
    division: selectedDivision,
    ...companyScope,
  };
  if (selectedSource) {
    leadWhere.source = selectedSource;
  }
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
  ] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      include: {
        assignedEmployee: true,
        client: { include: { territory: true } },
        _count: { select: { calls: true } },
      },
      orderBy: { createdAt: "desc" },
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
      where: { division: selectedDivision, ...companyScope },
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
      where: { ...(selectedSource ? { source: selectedSource } : {}), ...companyScope },
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
  ]);

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

  // Source count mapping
  const sourceCountMap = new Map(
    sourceCounts.map((item) => [item.source, item._count._all])
  );
  const totalPlatformLeadCount = sourceCounts.reduce(
    (sum, item) => sum + item._count._all,
    0
  );

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

  const assignedCount = filteredLeads.filter((l) => l.assignedEmployeeId).length;
  const unassignedInView = filteredLeads.length - assignedCount;
  const conversionRate =
    filteredLeads.length > 0
      ? Math.round(
          ((statusCountMap.get(LeadStatus.CONVERTED) ?? 0) / filteredLeads.length) * 100
        )
      : 0;

  const selectedPlatform = leadSources.find(
    (source) => source.value === selectedSource
  );

  // URL Helper preserving filter parameters
  const buildLeadsUrl = (overrides: {
    source?: string | null;
    division?: string | null;
    search?: string | null;
  }) => {
    const s = overrides.source !== undefined ? overrides.source : (params?.source || null);
    const d = overrides.division !== undefined ? overrides.division : selectedDivision;
    const q = overrides.search !== undefined ? overrides.search : (params?.search || "");

    const sp = new URLSearchParams();
    if (s && s !== "all") sp.set("source", s);
    if (d) sp.set("division", d);
    if (q && q.trim()) sp.set("search", q.trim());

    const qs = sp.toString();
    return qs ? `/admin/leads?${qs}` : "/admin/leads";
  };

  return (
    <div className="space-y-7">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary/60">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-primary border border-primary/20">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Multi-Channel API Ingestion
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Category:{" "}
                <strong className="text-ink">
                  {selectedDivision === "PCD_FRANCHISE"
                    ? "PCD Pharma Franchise"
                    : "Third-Party Manufacturing"}
                </strong>
              </span>
              {selectedPlatform && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                  Channel: {selectedPlatform.label}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              {selectedPlatform ? selectedPlatform.label : "Unified Lead Center"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Live funnel tracking commercial inquiries across Meta Ads, IndiaMART catalog,
              website landing forms, WhatsApp chats, and social channels. All metrics operate on pure
              database logic synced via API.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3.5 text-center shrink-0">
            <Metric
              label={selectedSource ? "In Platform" : "Category Leads"}
              value={filteredLeads.length.toString()}
              color="text-ink"
            />
            <Metric
              label="Unassigned"
              value={unassignedInView.toString()}
              color={unassignedInView > 0 ? "text-amber-600" : "text-ink"}
            />
            <Metric
              label="Conversion"
              value={`${conversionRate}%`}
              color="text-emerald-600"
            />
          </div>
        </div>
      </section>

      {/* 1. Branded Platform Navigation Cards */}
      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <PlatformCard
          href={buildLeadsUrl({ source: "all" })}
          label="All Platforms"
          detail={selectedDivision === "PCD_FRANCHISE" ? "All PCD Inquiries" : "All Third-Party"}
          count={totalPlatformLeadCount}
          active={!selectedSource}
          brandColor="all"
        />
        {leadSources.map((source) => (
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

      {/* 2. Commercial Ingestion Category Buttons (Positioned between All Platforms and Pipeline Velocity) */}
      <section className="rounded-3xl p-4 neo-panel bg-white border border-line shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="shrink-0 max-w-sm xl:max-w-md">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wider text-ink">
                Commercial Category Filter:
              </p>
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Switch between PCD Pharma Franchise and Third-Party Manufacturing to view pipeline velocity, channels, and leads
            </p>
          </div>

          {/* Side-by-side straight horizontal row filling available space on the right */}
          <div className="grid grid-cols-2 gap-3 flex-1 max-w-2xl">
            {/* PCD Pharma Franchise */}
            <Link
              href={buildLeadsUrl({ division: "PCD_FRANCHISE" })}
              className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-bold border transition ${
                selectedDivision === "PCD_FRANCHISE"
                  ? "bg-blue-700 text-white border-blue-700 shadow-sm ring-2 ring-blue-500/30"
                  : "bg-white text-blue-900 border-blue-200 hover:bg-blue-50/60"
              }`}
            >
              <span>🏢</span>
              <span>PCD Pharma Franchise</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  selectedDivision === "PCD_FRANCHISE"
                    ? "bg-white/25 text-white"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {pcdCount}
              </span>
            </Link>

            {/* Third-Party Manufacturing */}
            <Link
              href={buildLeadsUrl({ division: "THIRD_PARTY" })}
              className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-bold border transition ${
                selectedDivision === "THIRD_PARTY"
                  ? "bg-purple-700 text-white border-purple-700 shadow-sm ring-2 ring-purple-500/30"
                  : "bg-white text-purple-900 border-purple-200 hover:bg-purple-50/60"
              }`}
            >
              <span>🏭</span>
              <span>Third-Party Manufacturing</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  selectedDivision === "THIRD_PARTY"
                    ? "bg-white/25 text-white"
                    : "bg-purple-100 text-purple-800"
                }`}
              >
                {thirdPartyCount}
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Pipeline Velocity & Social Lead Watchlist */}
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl p-6 neo-panel">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-ink text-base">Pipeline Velocity</h2>
              <p className="text-xs text-ink-faint mt-0.5">
                Stage progression for{" "}
                <strong className="text-ink">
                  {selectedDivision === "PCD_FRANCHISE"
                    ? "PCD Pharma Franchise"
                    : "Third-Party Manufacturing"}
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
            AI is strictly utilized for automated DM and post comment replies after office hours 
            (sending PCD franchise brochures and collecting prospect phone numbers). All lead assignments 
            and metrics operate with pure database logic.
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

      {/* 4. Full-Width Leads Allotment Desk (Zero Blank Space, Perfectly Aligned) */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-teal-500 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse" />
              <h2 className="font-bold text-ink text-base">
                ⚡ Quick Leads Allotment Desk
              </h2>
            </div>
            <p className="text-xs text-ink-faint mt-0.5">
              Allocate batches of unassigned leads directly to any sales representative. Pure logic & audit logged.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-3.5 py-1 text-xs font-bold shrink-0">
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
              <option value="ALL">All Channels (Any source)</option>
              <option value="META">Meta Ads Forms</option>
              <option value="INDIAMART">IndiaMART Catalog</option>
              <option value="WHATSAPP">WhatsApp Direct</option>
              <option value="WEBSITE">Website Forms</option>
              <option value="SOCIAL">Social Signals</option>
              <option value="MANUAL">Manual Inquiries</option>
              <option value="EXCEL_IMPORT">All Excel Imports</option>
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
                defaultValue={selectedSource ?? LeadSource.MANUAL}
                className={inputClass}
              >
                {leadSources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                Category
              </label>
              <select name="division" defaultValue={selectedDivision} className={inputClass}>
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

      {/* 5. FULL-WIDTH Master Leads Table (No blank space on the left) */}
      <section className="overflow-hidden rounded-3xl neo-panel bg-white">
        <div className="border-b border-line px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-ink text-base">
                {selectedPlatform ? `${selectedPlatform.shortLabel} Inquiries` : "Master Leads Database"}
              </h2>
              <span className="rounded-full bg-slate-100 text-ink px-2.5 py-0.5 text-xs font-bold border border-line">
                {filteredLeads.length} Total
              </span>
              <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 text-xs font-bold">
                {selectedDivision === "PCD_FRANCHISE" ? "PCD Franchise" : "Third-Party"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              Full-width view of all incoming distributor applications with instant assignment and call tracking.
            </p>
          </div>

          {/* Search Bar + Quick Actions */}
          <div className="flex items-center gap-2">
            <form method="GET" action="/admin/leads" className="flex items-center gap-2">
              <input type="hidden" name="source" value={selectedSource ?? "all"} />
              <input type="hidden" name="division" value={selectedDivision} />
              <div className="relative">
                <input
                  type="text"
                  name="search"
                  defaultValue={search}
                  placeholder="Search leads, phone, notes..."
                  className="w-64 rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
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

            {selectedSource && (
              <Link
                href={buildLeadsUrl({ source: "all" })}
                className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition shrink-0"
              >
                Clear Platform
              </Link>
            )}
          </div>
        </div>

        {/* Desktop Full-Width Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-6 py-3.5">Lead & Contact</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Platform</th>
                <th className="px-6 py-3.5">Inquiry Details & Salts</th>
                <th className="px-6 py-3.5">Assigned Representative</th>
                <th className="px-6 py-3.5">Calls</th>
                <th className="px-6 py-3.5">Pipeline Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filteredLeads.map((lead) => {
                const sourceMeta = leadSources.find((s) => s.value === lead.source);
                const leadDataText = extractLeadData(lead.rawPayload) || lead.inquiryDetails || "Inquiry recorded via API";
                const isPcd = (lead.division || "PCD_FRANCHISE") === "PCD_FRANCHISE";

                return (
                  <tr key={lead.id} className="hover:bg-slate-50/60 transition">
                    {/* Lead & Contact */}
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <p className="font-bold text-ink text-sm">
                          {lead.name ?? "Unnamed Prospect"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-mono text-ink-muted">
                            {lead.phoneNumber ?? "No phone recorded"}
                          </p>
                          {lead.phoneNumber && (
                            <a
                              href={`https://wa.me/${lead.phoneNumber.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2 font-bold hover:bg-emerald-100"
                            >
                              WhatsApp
                            </a>
                          )}
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

                    {/* Inquiry Details & Salts */}
                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-xs text-ink-muted leading-relaxed line-clamp-3">
                        {leadDataText}
                      </p>
                      {lead.reassignedCount > 0 && (
                        <span className="inline-block mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2">
                          🔄 Reassigned ({lead.reassignedCount}x)
                        </span>
                      )}
                    </td>

                    {/* Assigned Representative */}
                    <td className="px-6 py-4">
                      <form action={updateLead} className="flex items-center gap-1.5">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="status" value={lead.status} />
                        <select
                          name="assignedEmployeeId"
                          defaultValue={lead.assignedEmployeeId ?? ""}
                          className={tableSelectClass}
                        >
                          <option value="">Unassigned</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
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

                    {/* Pipeline Stage */}
                    <td className="px-6 py-4">
                      <form action={updateLead} className="flex items-center gap-1.5">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input
                          type="hidden"
                          name="assignedEmployeeId"
                          value={lead.assignedEmployeeId ?? ""}
                        />
                        <select
                          name="status"
                          defaultValue={lead.status}
                          className={tableSelectClass}
                        >
                          {leadStatuses.map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={smallButtonClass}>
                          Save
                        </button>
                      </form>
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
          {filteredLeads.map((lead) => {
            const cleanPhone = (lead.phoneNumber || "").replace(/[^0-9]/g, "");
            const isPcd = (lead.division || "PCD_FRANCHISE") === "PCD_FRANCHISE";
            const leadDataText = extractLeadData(lead.rawPayload) || lead.inquiryDetails || "Inquiry recorded via API";

            return (
              <div key={lead.id} className="p-4 space-y-3">
                {/* Lead Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
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
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-ink bg-slate-100 px-2.5 py-1 rounded-lg">
                    <span>{getSourceIcon(lead.source)}</span>
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
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 active:bg-emerald-100"
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                {/* Inquiry notes */}
                <p className="text-xs text-ink-muted bg-slate-50 p-2.5 rounded-xl border border-line-soft leading-relaxed">
                  {leadDataText}
                </p>

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
                        name="assignedEmployeeId"
                        defaultValue={lead.assignedEmployeeId ?? ""}
                        className="w-full h-8 rounded-lg border border-line bg-white px-2 text-xs font-medium text-ink"
                      >
                        <option value="">Unassigned</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
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
      </section>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-primary/40 transition";

const tableSelectClass =
  "w-full min-w-36 rounded-xl border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm";

const smallButtonClass =
  "w-fit rounded-xl px-3 py-1.5 text-xs font-bold text-ink-muted neo-button hover:text-primary hover:border-primary/40";

function getSourceIconComponent(source: string) {
  switch (source) {
    case LeadSource.META:
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.001 8.167c-1.884 0-3.528.988-4.508 2.502-1.325-1.89-3.473-3.136-5.945-3.136C-.209 7.533-1.8 12.164.71 15.65c1.472 2.043 3.864 3.25 6.438 3.25 2.161 0 4.077-.852 5.518-2.26 1.442 1.408 3.357 2.26 5.518 2.26 2.574 0 4.966-1.207 6.438-3.25 2.51-3.486.919-8.117-.742-8.117-2.472 0-4.62 1.246-5.945 3.136-.98-1.514-2.624-2.502-4.508-2.502h-.428zm-4.733 8.358c-1.745 0-3.376-.82-4.364-2.193-1.636-2.271-.62-5.289.948-5.289 1.638 0 3.102.83 4.086 2.19 1.134 1.569 1.05 3.738-.67 5.292zm9.466 0c-1.72-1.554-1.804-3.723-.67-5.292.984-1.36 2.448-2.19 4.086-2.19 1.568 0 2.584 3.018.948 5.289-.988 1.373-2.619 2.193-4.364 2.193z"/>
        </svg>
      );
    case LeadSource.INDIAMART:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      );
    case LeadSource.WEBSITE:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    case LeadSource.WHATSAPP:
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.031 0C5.408 0 .034 5.374.034 11.997c0 2.116.552 4.181 1.6 6L.012 24l6.196-1.625a11.93 11.93 0 005.823 1.503h.005c6.623 0 11.997-5.374 11.997-12S18.654 0 12.031 0zm.005 21.902a9.917 9.917 0 01-5.06-1.385l-.363-.215-3.763.987 1.004-3.668-.236-.376A9.918 9.918 0 012.11 12c0-5.47 4.453-9.923 9.926-9.923 2.65 0 5.141 1.033 7.016 2.908A9.873 9.873 0 0121.954 12c0 5.471-4.454 9.923-9.918 9.923zm5.436-7.429c-.298-.15-1.764-.871-2.037-.97-.273-.1-.472-.15-.67.15-.2.298-.77 1.02-.944 1.218-.174.198-.348.223-.646.074-.298-.15-1.258-.464-2.396-1.48-.886-.79-1.484-1.766-1.658-2.064-.174-.298-.019-.459.13-.607.135-.134.298-.347.447-.521.149-.174.199-.298.298-.496.1-.198.05-.372-.025-.521-.075-.15-.67-1.614-.918-2.21-.242-.58-.488-.501-.67-.511-.174-.01-.373-.01-.572-.01-.198 0-.521.074-.794.372s-1.043 1.018-1.043 2.483c0 1.465 1.067 2.88 1.216 3.078.149.198 2.099 3.206 5.085 4.496.71.307 1.265.491 1.698.629.714.227 1.363.195 1.877.118.573-.086 1.764-.72 2.012-1.414.248-.694.248-1.289.174-1.414-.074-.124-.273-.198-.571-.347z"/>
        </svg>
      );
    case LeadSource.SOCIAL:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      );
    case LeadSource.MANUAL:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case LeadSource.EXCEL_IMPORT:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    default:
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
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
      active: "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25",
      inactive: "border-l-4 border-l-blue-500 hover:border-blue-400",
      countColor: "text-blue-600",
      iconBadge: "bg-blue-50 text-blue-600 border border-blue-200/60",
    },
    [LeadSource.INDIAMART]: {
      active: "bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-lg shadow-teal-600/25",
      inactive: "border-l-4 border-l-teal-500 hover:border-teal-400",
      countColor: "text-teal-600",
      iconBadge: "bg-teal-50 text-teal-600 border border-teal-200/60",
    },
    [LeadSource.WEBSITE]: {
      active: "bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-600/25",
      inactive: "border-l-4 border-l-purple-500 hover:border-purple-400",
      countColor: "text-purple-600",
      iconBadge: "bg-purple-50 text-purple-600 border border-purple-200/60",
    },
    [LeadSource.WHATSAPP]: {
      active: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25",
      inactive: "border-l-4 border-l-emerald-500 hover:border-emerald-400",
      countColor: "text-emerald-600",
      iconBadge: "bg-emerald-50 text-emerald-600 border border-emerald-200/60",
    },
    [LeadSource.SOCIAL]: {
      active: "bg-gradient-to-br from-rose-500 via-pink-600 to-purple-600 text-white shadow-lg shadow-rose-500/25",
      inactive: "border-l-4 border-l-rose-500 hover:border-rose-400",
      countColor: "text-rose-600",
      iconBadge: "bg-rose-50 text-rose-600 border border-rose-200/60",
    },
    [LeadSource.MANUAL]: {
      active: "bg-gradient-to-br from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-600/25",
      inactive: "border-l-4 border-l-amber-500 hover:border-amber-400",
      countColor: "text-amber-600",
      iconBadge: "bg-amber-50 text-amber-600 border border-amber-200/60",
    },
    [LeadSource.EXCEL_IMPORT]: {
      active: "bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-lg shadow-teal-600/25",
      inactive: "border-l-4 border-l-teal-500 hover:border-teal-400",
      countColor: "text-teal-600",
      iconBadge: "bg-teal-50 text-teal-600 border border-teal-200/60",
    },
  };

  const currentTheme = brandStyles[brandColor] ?? brandStyles.all;

  return (
    <Link
      href={href}
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
          {getSourceIconComponent(brandColor)}
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

function Metric({
  label,
  value,
  color = "text-ink",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3 neo-pressed border border-line">
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-ink-faint mt-0.5">{label}</p>
    </div>
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

function getSourceIcon(source: LeadSource) {
  switch (source) {
    case LeadSource.META:
      return "📘";
    case LeadSource.INDIAMART:
      return "🏪";
    case LeadSource.WEBSITE:
      return "🌐";
    case LeadSource.WHATSAPP:
      return "💬";
    case LeadSource.SOCIAL:
      return "📸";
    case LeadSource.MANUAL:
      return "📝";
    default:
      return "📌";
  }
}

