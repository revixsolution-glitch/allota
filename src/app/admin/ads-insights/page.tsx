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

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl px-7 py-6 neo-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Ads <GradientText>Insights</GradientText>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              How your Meta ads are doing — spend, clicks, and where they&apos;re being seen.
            </p>
          </div>
          <AdsInsightsRefreshButton lastSyncedAt={sync?.syncedAt?.toISOString() ?? null} />
        </div>
      </section>

      {sync?.lastError && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-bold text-rose-800">Couldn&apos;t get the latest numbers</p>
          <p className="mt-1 text-sm text-rose-700">{sync.lastError}</p>
          {!settings.metaAdAccountId && (
            <p className="mt-2 text-xs text-rose-600">
              Add your Meta Ad Account ID in Settings under Meta Suite, then click Refresh above.
            </p>
          )}
        </section>
      )}

      {!hasData && !sync?.lastError && (
        <section className="rounded-3xl border border-line bg-white p-10 text-center neo-panel">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">📊</div>
          <h3 className="mt-3 text-sm font-bold text-ink">No numbers yet</h3>
          <p className="mt-1 text-sm text-ink-muted">Click Refresh above to pull in your current ad performance.</p>
        </section>
      )}

      {hasData && summary && (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total spent" value={money(summary.totalSpend)} tone="text-ink" />
            <Stat label="Total clicks" value={num(summary.totalClicks)} tone="text-sky-700" />
            <Stat label="People reached" value={num(summary.totalReach)} tone="text-violet-700" />
            <Stat label="Click rate" value={`${summary.avgCtr.toFixed(1)}%`} tone="text-emerald-700" />
          </section>

          <section className="rounded-3xl neo-panel bg-white overflow-hidden">
            <div className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-6 py-4">
              <h2 className="text-lg font-extrabold tracking-tight text-ink">Ads running now</h2>
            </div>
            <div className="divide-y divide-line-soft">
              {summary.campaigns.length === 0 && (
                <p className="p-6 text-sm text-ink-muted">No campaigns found on this ad account.</p>
              )}
              {summary.campaigns.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink truncate">{c.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-slate-100 text-ink-faint"
                        }`}
                      >
                        {c.status === "ACTIVE" ? "● Running" : c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {c.startDate ? `Started ${new Date(c.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Start date unavailable"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-5 text-right text-sm">
                    <div>
                      <p className="font-extrabold text-ink">{money(c.spend)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Spent</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-ink">{num(c.clicks)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Clicks</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-ink">{num(c.impressions)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Seen</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {summary.locations.length > 0 && (
            <section className="rounded-3xl neo-panel bg-white overflow-hidden">
              <div className="border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-6 py-4">
                <h2 className="text-lg font-extrabold tracking-tight text-ink">Where people are seeing your ads</h2>
              </div>
              <div className="divide-y divide-line-soft">
                {summary.locations.slice(0, 15).map((l) => (
                  <div key={l.region} className="flex items-center justify-between px-6 py-3">
                    <p className="font-semibold text-ink">{l.region}</p>
                    <div className="flex gap-5 text-right text-sm">
                      <span className="font-bold text-ink">{money(l.spend)}</span>
                      <span className="text-ink-muted">{num(l.clicks)} clicks</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl p-4 neo-panel bg-white text-center">
      <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-ink-faint">{label}</p>
    </div>
  );
}
