import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

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

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pulls a simple, non-technical summary from Meta's Marketing API:
 * "how many ads are running, where, how many clicks, what's been spent,
 * when they started". One admin-triggered sync, cached until the next
 * click — this is not a live dashboard, and doesn't need to be for a
 * PCD/pharma admin checking in once a day.
 */
export async function POST() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeCompanyId = getActiveCompanyId(session);
  if (!activeCompanyId) {
    return NextResponse.json({ error: "No active company" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({
    where: { companyId: activeCompanyId },
    select: { enableAdsInsights: true, metaAdAccountId: true, metaAccessToken: true, metaApiKey: true },
  });

  if (!settings?.enableAdsInsights) {
    return NextResponse.json({ error: "Ads Insights is not enabled for this company." }, { status: 403 });
  }

  const adAccountId = settings.metaAdAccountId?.trim();
  const accessToken = settings.metaAccessToken || settings.metaApiKey;

  if (!adAccountId) {
    const message = "No Meta Ad Account ID is saved in Settings yet. Add it under Meta Suite, then sync again.";
    await saveError(activeCompanyId, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (!accessToken) {
    const message = "No Meta access token is saved in Settings yet.";
    await saveError(activeCompanyId, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const act = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  try {
    // 1. Campaigns with their own insight totals (spend/clicks/impressions/reach/ctr, all time to date).
    const campaignsUrl = `https://graph.facebook.com/v19.0/${act}/campaigns?fields=id,name,status,insights.date_preset(maximum){spend,clicks,impressions,reach,ctr,date_start}&limit=100&access_token=${accessToken}`;
    const campaignsRes = await fetch(campaignsUrl);
    const campaignsJson = await campaignsRes.json();

    if (!campaignsRes.ok) {
      const message = campaignsJson?.error?.message || "Meta declined the request. Check the Ad Account ID and that the access token has ads_read permission.";
      await saveError(activeCompanyId, message);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const campaigns: SimpleCampaign[] = (campaignsJson.data || []).map((c: any) => {
      const insight = c.insights?.data?.[0] || {};
      return {
        id: c.id,
        name: c.name || "Untitled campaign",
        status: c.status || "UNKNOWN",
        spend: num(insight.spend),
        clicks: num(insight.clicks),
        impressions: num(insight.impressions),
        reach: num(insight.reach),
        ctr: num(insight.ctr),
        startDate: insight.date_start || null,
      };
    });

    // 2. Account-level breakdown by region, so "which locations" has a real answer.
    const locUrl = `https://graph.facebook.com/v19.0/${act}/insights?level=account&breakdowns=region&fields=spend,clicks,impressions&date_preset=maximum&limit=50&access_token=${accessToken}`;
    const locRes = await fetch(locUrl);
    const locJson = await locRes.json().catch(() => ({ data: [] }));
    const locations: SimpleLocation[] = locRes.ok
      ? (locJson.data || []).map((r: any) => ({
          region: r.region || "Unknown",
          spend: num(r.spend),
          clicks: num(r.clicks),
          impressions: num(r.impressions),
        }))
      : [];

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalReach = campaigns.reduce((s, c) => s + c.reach, 0);

    const summary: AdsSummary = {
      totalSpend,
      totalClicks,
      totalImpressions,
      totalReach,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      currency: "INR",
      campaigns: campaigns.sort((a, b) => b.spend - a.spend),
      locations: locations.sort((a, b) => b.spend - a.spend),
    };

    await prisma.adsInsightsSync.upsert({
      where: { companyId: activeCompanyId },
      update: { summary: summary as any, syncedAt: new Date(), lastError: null },
      create: { companyId: activeCompanyId, summary: summary as any },
    });

    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    const message = err?.message || "Could not reach Meta right now.";
    await saveError(activeCompanyId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function saveError(companyId: string, message: string) {
  await prisma.adsInsightsSync
    .upsert({
      where: { companyId },
      update: { lastError: message },
      create: { companyId, summary: {}, lastError: message },
    })
    .catch(() => {});
}
