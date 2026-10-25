"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GradientText } from "@/components/GradientText";
import { AdsInsightsRefreshButton } from "@/components/AdsInsightsRefreshButton";
import { parseDashboardDateFilter } from "@/lib/date-filters";

export interface SimpleCampaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  ctr: number;
  leads?: number;
  startDate: string | null;
}

export interface SimpleLocation {
  region: string;
  spend: number;
  clicks: number;
  impressions: number;
}

export interface AdsSummary {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalReach: number;
  totalLeads?: number;
  avgCtr: number;
  currency: string;
  campaigns: SimpleCampaign[];
  locations: SimpleLocation[];
}

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-IN");

const ITEMS_PER_PAGE = 5;

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED";
type DateFilter = "ALL_TIME" | "LAST_30" | "LAST_90" | "THIS_YEAR" | "CUSTOM";
type SortOption = "spend_desc" | "leads_desc" | "cpl_asc" | "reach_desc" | "date_desc";

export function AdsInsightsView({
  summary,
  syncError,
  lastSyncedAt,
  hasAdAccountId,
}: {
  summary: AdsSummary | null;
  syncError?: string | null;
  lastSyncedAt?: string | null;
  hasAdAccountId?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const globalRange = searchParams.get("range") || "all_time";
  const globalFrom = searchParams.get("from") || "";
  const globalTo = searchParams.get("to") || "";

  const parsedGlobalDate = useMemo(() => {
    return parseDashboardDateFilter(globalRange, globalFrom, globalTo);
  }, [globalRange, globalFrom, globalTo]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL_TIME");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("spend_desc");
  const [currentPage, setCurrentPage] = useState(1);

  const allCampaigns = summary?.campaigns || [];

  // Counts for status tabs
  const activeCount = useMemo(
    () => allCampaigns.filter((c) => c.status === "ACTIVE").length,
    [allCampaigns]
  );
  const pausedCount = useMemo(
    () => allCampaigns.filter((c) => c.status !== "ACTIVE").length,
    [allCampaigns]
  );

  // Reset page whenever any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, dateFilter, customStartDate, customEndDate, searchQuery, sortBy, globalRange, globalFrom, globalTo]);

  // Filtered & Sorted Campaigns
  const filteredCampaigns = useMemo(() => {
    return allCampaigns
      .filter((c) => {
        // 1. Status Filter
        if (statusFilter === "ACTIVE" && c.status !== "ACTIVE") return false;
        if (statusFilter === "PAUSED" && c.status === "ACTIVE") return false;

        // 2. Search Query Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesName = c.name.toLowerCase().includes(q);
          const matchesId = c.id.toLowerCase().includes(q);
          if (!matchesName && !matchesId) return false;
        }

        // 3. Global Navbar Date Filter (from ?range= in URL)
        if (parsedGlobalDate.start && c.startDate) {
          const campTime = new Date(c.startDate).getTime();
          if (campTime < parsedGlobalDate.start.getTime()) return false;
          if (parsedGlobalDate.end && campTime > parsedGlobalDate.end.getTime()) return false;
        }

        // 4. In-page Date Range Filter (if user selected local pill while global is all_time)
        if (parsedGlobalDate.preset === "all_time" && dateFilter !== "ALL_TIME" && c.startDate) {
          const campDate = new Date(c.startDate).getTime();
          const now = Date.now();

          if (dateFilter === "LAST_30") {
            const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
            if (campDate < thirtyDaysAgo) return false;
          } else if (dateFilter === "LAST_90") {
            const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
            if (campDate < ninetyDaysAgo) return false;
          } else if (dateFilter === "THIS_YEAR") {
            const currentYear = new Date().getFullYear();
            if (new Date(c.startDate).getFullYear() !== currentYear) return false;
          } else if (dateFilter === "CUSTOM") {
            if (customStartDate) {
              const fromTime = new Date(customStartDate).getTime();
              if (campDate < fromTime) return false;
            }
            if (customEndDate) {
              const toTime = new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000 - 1;
              if (campDate > toTime) return false;
            }
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "spend_desc") return b.spend - a.spend;
        if (sortBy === "leads_desc") return (b.leads || 0) - (a.leads || 0);
        if (sortBy === "reach_desc") return b.reach - a.reach;
        if (sortBy === "date_desc") {
          const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
          const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
          return dateB - dateA;
        }
        if (sortBy === "cpl_asc") {
          const cplA = a.leads && a.leads > 0 ? a.spend / a.leads : Infinity;
          const cplB = b.leads && b.leads > 0 ? b.spend / b.leads : Infinity;
          return cplA - cplB;
        }
        return 0;
      });
  }, [
    allCampaigns,
    statusFilter,
    dateFilter,
    customStartDate,
    customEndDate,
    searchQuery,
    sortBy,
  ]);

  // Dynamic KPI Metrics for filtered campaigns
  const filteredMetrics = useMemo(() => {
    const isFiltered =
      statusFilter !== "ALL" ||
      dateFilter !== "ALL_TIME" ||
      parsedGlobalDate.preset !== "all_time" ||
      searchQuery.trim().length > 0;

    const totalSpend = filteredCampaigns.reduce((acc, c) => acc + c.spend, 0);
    const totalLeads = filteredCampaigns.reduce((acc, c) => acc + (c.leads || 0), 0);
    const totalReach = filteredCampaigns.reduce((acc, c) => acc + c.reach, 0);
    const totalClicks = filteredCampaigns.reduce((acc, c) => acc + c.clicks, 0);
    const totalImpressions = filteredCampaigns.reduce((acc, c) => acc + c.impressions, 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const costPerLead = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;

    return {
      isFiltered,
      totalSpend,
      totalLeads,
      totalReach,
      totalClicks,
      avgCtr,
      costPerLead,
      count: filteredCampaigns.length,
    };
  }, [filteredCampaigns, statusFilter, dateFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredCampaigns.length);
  const currentCampaigns = filteredCampaigns.slice(startIndex, endIndex);

  // Locations sorted by spend
  const validLocations = useMemo(() => {
    return (summary?.locations || [])
      .filter((l) => l.region && l.region.toLowerCase() !== "unknown" && l.spend > 0)
      .sort((a, b) => b.spend - a.spend);
  }, [summary?.locations]);

  const topRegionName = validLocations[0]?.region;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-white p-6 sm:p-7 neo-panel border border-line">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Official Meta Marketing API Connected
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              Ads <GradientText>Intelligence Desk</GradientText>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted">
              Live performance from Meta Ads Manager — track real WhatsApp inquiries, cost efficiency, and territory reach.
            </p>
          </div>
          <AdsInsightsRefreshButton lastSyncedAt={lastSyncedAt ?? null} />
        </div>
      </section>

      {/* Sync Error State */}
      {syncError && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-bold text-rose-800">Couldn&apos;t get the latest numbers from Meta</p>
          <p className="mt-1 text-sm text-rose-700">{syncError}</p>
          {!hasAdAccountId && (
            <p className="mt-2 text-xs text-rose-600">
              Add your Meta Ad Account ID in Settings under Meta Suite, then click Refresh above.
            </p>
          )}
        </section>
      )}

      {/* Empty State */}
      {(!summary || allCampaigns.length === 0) && !syncError && (
        <section className="rounded-3xl border border-line bg-white p-12 text-center neo-panel">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-3xl">
            📊
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">No ad performance cached yet</h3>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-md mx-auto">
            Click &ldquo;Refresh from Meta&rdquo; above to pull live metrics from your connected Meta Ad Account.
          </p>
        </section>
      )}

      {/* Main Content when Data Available */}
      {summary && allCampaigns.length > 0 && (
        <>
          {/* Executive KPI Scorecards Strip (Dynamic with Filter Scope) */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-ink-faint">
                  {filteredMetrics.isFiltered
                    ? `Filtered Metrics (${filteredMetrics.count} of ${allCampaigns.length} Campaigns)`
                    : "All-Time Overview"}
                </span>
                {parsedGlobalDate.preset !== "all_time" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 border border-teal-200 text-[11px] font-bold text-teal-800">
                    <span>📅 {parsedGlobalDate.label}</span>
                  </span>
                )}
              </div>
              {filteredMetrics.isFiltered && (
                <button
                  onClick={() => {
                    setStatusFilter("ALL");
                    setDateFilter("ALL_TIME");
                    setSearchQuery("");
                    router.push(pathname);
                    router.refresh();
                  }}
                  className="text-xs font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  Reset to All-Time ✕
                </button>
              )}
            </div>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                icon="💰"
                label="Total Ad Spend"
                value={money(filteredMetrics.totalSpend)}
                subtext={
                  filteredMetrics.isFiltered
                    ? `From ${filteredMetrics.count} campaigns`
                    : "All-time Meta budget spent"
                }
                tone="text-slate-900"
                badge={null}
              />
              <StatCard
                icon="💬"
                label="WhatsApp Inquiries"
                value={filteredMetrics.totalLeads > 0 ? num(filteredMetrics.totalLeads) : "0"}
                subtext="Direct prospect conversations"
                tone="text-emerald-600"
                badge="High Intent"
                badgeColor="bg-emerald-50 text-emerald-800 border-emerald-200"
              />
              <StatCard
                icon="⚡"
                label="Cost / Inquiry"
                value={filteredMetrics.costPerLead > 0 ? money(filteredMetrics.costPerLead) : "—"}
                subtext="Average spend per lead"
                tone="text-teal-600"
                badge={
                  filteredMetrics.costPerLead > 0 && filteredMetrics.costPerLead < 100
                    ? "Super Efficient"
                    : null
                }
                badgeColor="bg-teal-50 text-teal-800 border-teal-200"
              />
              <StatCard
                icon="👥"
                label="People Reached"
                value={num(filteredMetrics.totalReach)}
                subtext="Unique prospects who saw ad"
                tone="text-violet-600"
                badge={null}
              />
              <StatCard
                icon="👆"
                label="Ad Link Clicks"
                value={num(filteredMetrics.totalClicks)}
                subtext={`Avg. CTR: ${filteredMetrics.avgCtr.toFixed(2)}%`}
                tone="text-sky-600"
                badge={null}
              />
            </section>
          </div>

          {/* Efficiency Summary Banner */}
          {filteredMetrics.totalLeads > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg">
                  💡
                </span>
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-emerald-950">
                    Campaign Efficiency Insight
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                    Generated <strong>{num(filteredMetrics.totalLeads)} direct WhatsApp inquiries</strong> at an average cost of <strong>{money(filteredMetrics.costPerLead)} per lead</strong>.
                    {topRegionName ? ` Top converting territory is currently ${topRegionName}.` : ""}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                  <span>✓</span> Lead Cost: {money(filteredMetrics.costPerLead)}
                </span>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* CAMPAIGNS SECTION WITH FILTERS, SEARCH, & PAGINATION         */}
          {/* ============================================================ */}
          <section className="rounded-3xl neo-panel bg-white overflow-hidden border border-line">
            {/* 1. Header Toolbar */}
            <div className="border-b border-line bg-slate-50/70 px-5 sm:px-6 py-4 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-ink flex items-center gap-2">
                    <span>📢</span>
                    <span>
                      {statusFilter === "ACTIVE"
                        ? "Active Campaigns on Meta"
                        : statusFilter === "PAUSED"
                        ? "Inactive / Paused Campaigns"
                        : "Meta Ad Campaigns"}
                    </span>
                  </h2>
                  <p className="text-xs text-ink-faint">
                    Campaigns delivering to Facebook, Instagram, and WhatsApp
                  </p>
                </div>

                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-2xl border border-line self-start sm:self-auto">
                  <button
                    onClick={() => setStatusFilter("ALL")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === "ALL"
                        ? "bg-white text-ink shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    All ({allCampaigns.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter("ACTIVE")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === "ACTIVE"
                        ? "bg-white text-emerald-800 shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Active ({activeCount})</span>
                  </button>
                  <button
                    onClick={() => setStatusFilter("PAUSED")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === "PAUSED"
                        ? "bg-white text-ink shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    Paused ({pausedCount})
                  </button>
                </div>
              </div>

              {/* 2. Secondary Filter Bar: Date Filters, Search, and Sort */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1 border-t border-line/60">
                {/* Date Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  <span className="text-ink-faint font-bold shrink-0 mr-1 text-[11px] uppercase tracking-wider">
                    Date:
                  </span>
                  {[
                    { id: "ALL_TIME", label: "All Time" },
                    { id: "LAST_30", label: "Last 30 Days" },
                    { id: "LAST_90", label: "Last 90 Days" },
                    { id: "THIS_YEAR", label: "This Year" },
                    { id: "CUSTOM", label: "Custom Range" },
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDateFilter(d.id as DateFilter)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                        dateFilter === d.id
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-white text-ink-muted border border-line hover:bg-slate-100"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Search & Sort Controls */}
                <div className="flex items-center gap-2">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-60">
                    <span className="absolute left-2.5 top-2 text-ink-faint text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Search campaign name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-line rounded-xl pl-7 pr-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-teal-600 shadow-2xs"
                    />
                  </div>

                  {/* Sort By Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    aria-label="Sort campaigns by metric"
                    className="bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink-muted focus:outline-teal-600 shadow-2xs cursor-pointer"
                  >
                    <option value="spend_desc">Sort: Highest Spend</option>
                    <option value="leads_desc">Sort: Most Inquiries</option>
                    <option value="cpl_asc">Sort: Lowest Cost/Lead</option>
                    <option value="reach_desc">Sort: Highest Reach</option>
                    <option value="date_desc">Sort: Newest Date</option>
                  </select>
                </div>
              </div>

              {/* Custom Date Inputs if CUSTOM selected */}
              {dateFilter === "CUSTOM" && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/60 text-xs">
                  <span className="text-ink-faint font-semibold">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    aria-label="Start date filter"
                    className="bg-white border border-line rounded-xl px-2.5 py-1 text-xs text-ink focus:outline-teal-600"
                  />
                  <span className="text-ink-faint font-semibold">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    aria-label="End date filter"
                    className="bg-white border border-line rounded-xl px-2.5 py-1 text-xs text-ink focus:outline-teal-600"
                  />
                  {(customStartDate || customEndDate) && (
                    <button
                      onClick={() => {
                        setCustomStartDate("");
                        setCustomEndDate("");
                      }}
                      className="text-xs text-rose-600 font-bold hover:underline ml-2"
                    >
                      Clear Dates
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. Campaign Items List (Paginated: 5 per page) */}
            <div className="divide-y divide-line/60">
              {filteredCampaigns.length === 0 ? (
                <div className="p-12 text-center text-sm text-ink-muted">
                  <span className="text-3xl block mb-2">🔍</span>
                  <p className="font-bold text-ink">No campaigns match your current filters</p>
                  <p className="text-xs text-ink-faint mt-1">
                    Try switching status to &quot;All&quot; or clearing date filters.
                  </p>
                  <button
                    onClick={() => {
                      setStatusFilter("ALL");
                      setDateFilter("ALL_TIME");
                      setSearchQuery("");
                    }}
                    className="mt-3 inline-block rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-black transition"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                currentCampaigns.map((c) => {
                  const campaignCpl = c.leads && c.leads > 0 ? Math.round(c.spend / c.leads) : 0;
                  const isActive = c.status === "ACTIVE";

                  return (
                    <div
                      key={c.id}
                      className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 sm:p-6 hover:bg-slate-50/50 transition"
                    >
                      {/* Campaign Title & Meta info */}
                      <div className="min-w-0 max-w-xl space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                              isActive
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-slate-100 text-ink-faint border-line"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                              }`}
                            />
                            {isActive ? "Running & Active" : c.status.toLowerCase()}
                          </span>
                          <span className="text-[11px] font-mono text-ink-faint">
                            ID: {c.id}
                          </span>
                        </div>

                        <h3 className="font-extrabold text-sm sm:text-base text-ink leading-snug">
                          {c.name}
                        </h3>

                        <p className="text-xs text-ink-faint">
                          {c.startDate
                            ? `Running since ${new Date(c.startDate).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}`
                            : "Start date unavailable"}
                        </p>
                      </div>

                      {/* Campaign Key Metrics Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
                        <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-3 text-center">
                          <p className="text-base sm:text-lg font-black text-emerald-700">
                            {c.leads !== undefined && c.leads > 0 ? `💬 ${num(c.leads)}` : "—"}
                          </p>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800/80">
                            Inquiries
                          </p>
                        </div>

                        <div className="rounded-2xl bg-teal-50/50 border border-teal-100 p-3 text-center">
                          <p className="text-base sm:text-lg font-black text-teal-700">
                            {campaignCpl > 0 ? money(campaignCpl) : "—"}
                          </p>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800/80">
                            Cost / Lead
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-line/60 p-3 text-center">
                          <p className="text-base sm:text-lg font-black text-ink">
                            {money(c.spend)}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                            Spent
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-line/60 p-3 text-center">
                          <p className="text-base sm:text-lg font-black text-ink">
                            {num(c.reach)}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                            Reach
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-line/60 p-3 text-center col-span-2 sm:col-span-1">
                          <p className="text-base sm:text-lg font-black text-sky-700">
                            {num(c.clicks)}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                            Clicks ({c.ctr.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 4. Pagination Bar (Requested: after 5 add pagination so page scroll is less) */}
            {filteredCampaigns.length > 0 && (
              <div className="border-t border-line bg-slate-50/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs font-semibold text-ink-muted">
                  Showing <strong className="text-ink">{startIndex + 1}</strong> to{" "}
                  <strong className="text-ink">{endIndex}</strong> of{" "}
                  <strong className="text-ink">{filteredCampaigns.length}</strong> campaigns
                  {filteredCampaigns.length !== allCampaigns.length && (
                    <span className="text-ink-faint ml-1">
                      (filtered from {allCampaigns.length} total)
                    </span>
                  )}
                </p>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5 self-center sm:self-auto">
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-xl border border-line bg-white text-xs font-bold text-ink-muted hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                    >
                      ◀ Prev
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      // Only display up to 5 surrounding pages if there are many pages
                      if (
                        totalPages > 6 &&
                        pageNum !== 1 &&
                        pageNum !== totalPages &&
                        Math.abs(pageNum - currentPage) > 1
                      ) {
                        if (pageNum === 2 || pageNum === totalPages - 1) {
                          return (
                            <span key={pageNum} className="px-1 text-xs text-ink-faint">
                              …
                            </span>
                          );
                        }
                        return null;
                      }

                      const isCurrent = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`h-8 w-8 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-2xs ${
                            isCurrent
                              ? "bg-slate-900 text-white"
                              : "bg-white text-ink-muted border border-line hover:bg-slate-100"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-xl border border-line bg-white text-xs font-bold text-ink-muted hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Regional Territory Breakdown Section */}
          {validLocations.length > 0 && (
            <section className="rounded-3xl neo-panel bg-white overflow-hidden border border-line">
              <div className="border-b border-line bg-slate-50/70 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-ink flex items-center gap-2">
                    <span>🗺️</span> Territory &amp; State Distribution
                  </h2>
                  <p className="text-xs text-ink-faint">
                    Where your ads are being shown across target states
                  </p>
                </div>
                <span className="text-xs font-semibold text-ink-muted">
                  Ranked by budget share
                </span>
              </div>

              <div className="divide-y divide-line/60 p-2 sm:p-4">
                {validLocations.slice(0, 10).map((loc, idx) => {
                  const totalSpend = summary.totalSpend;
                  const sharePct = totalSpend > 0 ? Math.round((loc.spend / totalSpend) * 100) : 0;

                  return (
                    <div
                      key={loc.region}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-50/60 rounded-2xl transition"
                    >
                      {/* State Name & Rank */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-ink-muted">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-extrabold text-sm text-ink">{loc.region}</p>
                          <p className="text-[11px] text-ink-faint font-medium">
                            {num(loc.clicks)} clicks · {num(loc.impressions)} impressions
                          </p>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="flex-1 max-w-md hidden md:block">
                        <div className="flex items-center justify-between text-[11px] font-bold text-ink-faint mb-1">
                          <span>Budget Share</span>
                          <span>{sharePct}%</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.max(sharePct, 3)}%` }}
                          />
                        </div>
                      </div>

                      {/* Spend & Stats */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 text-right">
                        <span className="md:hidden text-xs font-bold text-ink-muted">
                          {sharePct}% share
                        </span>
                        <div>
                          <p className="font-black text-sm text-ink">{money(loc.spend)}</p>
                          <p className="text-[10px] font-semibold text-ink-faint">Spent</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  tone,
  badge,
  badgeColor,
}: {
  icon: string;
  label: string;
  value: string;
  subtext: string;
  tone: string;
  badge: string | null;
  badgeColor?: string;
}) {
  return (
    <div className="rounded-3xl p-5 neo-panel bg-white border border-line flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xl">{icon}</span>
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${
                badgeColor || "bg-slate-100 text-ink-muted"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <p className={`text-2xl sm:text-3xl font-black tracking-tight ${tone}`}>
          {value}
        </p>
        <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-ink-faint">
          {label}
        </p>
      </div>
      <p className="mt-3 text-[11px] text-ink-muted border-t border-line/60 pt-2 font-medium">
        {subtext}
      </p>
    </div>
  );
}
