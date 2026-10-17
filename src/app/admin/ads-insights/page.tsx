import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { GradientText } from "@/components/GradientText";
import { AdsInsightsRefreshButton } from "@/components/AdsInsightsRefreshButton";

export const dynamic = "force-dynamic";

interface SimpleCampaign {
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

interface SimpleLocation {
  region: string;
  spend: number;
  clicks: number;
  impressions: number;
}

interface AdsSummary {
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

export default async function AdsInsightsPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    redirect("/login");
  }
  const activeCompanyId = getActiveCompanyId(session);

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
        select: { enableAdsInsights: true, metaAdAccountId: true },
      })
    : null;

  if (!settings?.enableAdsInsights) {
    redirect("/admin/leads");
  }

  const sync = activeCompanyId
    ? await prisma.adsInsightsSync.findUnique({ where: { companyId: activeCompanyId } })
    : null;

  const summary = (sync?.summary as unknown as AdsSummary | undefined) || null;
  const hasData = summary && (summary.campaigns?.length ?? 0) > 0;

  const totalSpend = summary?.totalSpend ?? 0;
  const totalLeads = summary?.totalLeads ?? 0;
  const costPerLead = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;

  // Filter out empty/unknown regions and sort by spend
  const validLocations = (summary?.locations || [])
    .filter((l) => l.region && l.region.toLowerCase() !== "unknown" && l.spend > 0)
    .sort((a, b) => b.spend - a.spend);

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
          <AdsInsightsRefreshButton lastSyncedAt={sync?.syncedAt?.toISOString() ?? null} />
        </div>
      </section>

      {/* Sync Error State */}
      {sync?.lastError && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-bold text-rose-800">Couldn&apos;t get the latest numbers from Meta</p>
          <p className="mt-1 text-sm text-rose-700">{sync.lastError}</p>
          {!settings.metaAdAccountId && (
            <p className="mt-2 text-xs text-rose-600">
              Add your Meta Ad Account ID in Settings under Meta Suite, then click Refresh above.
            </p>
          )}
        </section>
      )}

      {/* Empty State */}
      {!hasData && !sync?.lastError && (
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
      {hasData && summary && (
        <>
          {/* Executive KPI Scorecards */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon="💰"
              label="Total Ad Spend"
              value={money(totalSpend)}
              subtext="All-time Meta budget spent"
              tone="text-slate-900"
              badge={null}
            />
            <StatCard
              icon="💬"
              label="WhatsApp Inquiries"
              value={totalLeads > 0 ? num(totalLeads) : "0"}
              subtext="Direct prospect conversations"
              tone="text-emerald-600"
              badge="High Intent"
              badgeColor="bg-emerald-50 text-emerald-800 border-emerald-200"
            />
            <StatCard
              icon="⚡"
              label="Cost / Inquiry"
              value={costPerLead > 0 ? money(costPerLead) : "—"}
              subtext="Average spend per lead"
              tone="text-teal-600"
              badge={costPerLead > 0 && costPerLead < 50 ? "Super Efficient" : null}
              badgeColor="bg-teal-50 text-teal-800 border-teal-200"
            />
            <StatCard
              icon="👥"
              label="People Reached"
              value={num(summary.totalReach)}
              subtext="Unique prospects who saw ad"
              tone="text-violet-600"
              badge={null}
            />
            <StatCard
              icon="👆"
              label="Ad Link Clicks"
              value={num(summary.totalClicks)}
              subtext={`Avg. CTR: ${summary.avgCtr.toFixed(2)}%`}
              tone="text-sky-600"
              badge={null}
            />
          </section>

          {/* Efficiency Summary Banner */}
          {totalLeads > 0 && (
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
                    Your ad generated <strong>{num(totalLeads)} direct WhatsApp inquiries</strong> at an average cost of <strong>{money(costPerLead)} per lead</strong>.
                    {topRegionName ? ` Top converting territory is currently ${topRegionName}.` : ""}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                  <span>✓</span> Lead Cost: {money(costPerLead)}
                </span>
              </div>
            </div>
          )}

          {/* Active Campaigns Section */}
          <section className="rounded-3xl neo-panel bg-white overflow-hidden border border-line">
            <div className="border-b border-line bg-slate-50/70 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-ink flex items-center gap-2">
                  <span>📢</span> Active Campaigns on Meta
                </h2>
                <p className="text-xs text-ink-faint">
                  Campaigns delivering to Facebook, Instagram, and WhatsApp
                </p>
              </div>
              <span className="text-xs font-bold text-ink-muted bg-white px-3 py-1 rounded-xl border border-line shadow-2xs">
                {summary.campaigns.length} Campaign{summary.campaigns.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="divide-y divide-line/60">
              {summary.campaigns.length === 0 ? (
                <p className="p-8 text-center text-sm text-ink-muted">
                  No campaigns found on this Meta ad account.
                </p>
              ) : (
                summary.campaigns.map((c) => {
                  const campaignCpl = c.leads && c.leads > 0 ? Math.round(c.spend / c.leads) : 0;
                  const isActive = c.status === "ACTIVE";

                  return (
                    <div
                      key={c.id}
                      className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 sm:p-6 hover:bg-slate-50/40 transition"
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
