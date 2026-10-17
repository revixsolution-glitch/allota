import { NextResponse } from "next/server";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleOnboard();
}

export async function POST() {
  return handleOnboard();
}

async function handleOnboard() {
  try {
    const metaAppId = "1422721583164519";
    const metaAppSecret = "3a0df9721f48a8c820073b5dbcfbdc39";
    const metaAccessToken =
      "EAAUN9S6ULGcBS32Ql39xwBPMqRL7XZCVwhOkAqr7Tg0WZCKoNhkhp9Ku1kmCC4LmxBUL83hWcdGHbOA3TmPqmQYW7U2TbDfr4OT1RWjY6wqQtnhHWd9R4FjoxZAh2r7eO9a4VHkJvBf44smHAI9ZBL1CkrkfiR0J1mcxlGMZALkY7wjMMFk0p6SG5ZCczzWgZDZD";
    const metaPageId = "112876304657266";
    const metaAdAccountId = "act_1307420369741671";
    const metaWabaId = "1460433551636446";
    const metaPhoneNumberId = "739027919285346";

    // 1. Locate Kesrox Company in default database
    let company = await defaultPrisma.company.findFirst({
      where: {
        OR: [
          { slug: "Kesrox-Pharmaceuticals" },
          { slug: "kesrox-pharma" },
          { name: { contains: "Kesrox", mode: "insensitive" } },
        ],
      },
    });

    if (!company) {
      company = await defaultPrisma.company.create({
        data: {
          name: "Kesrox Pharmaceuticals",
          slug: "kesrox-pharma",
          contactEmail: "info@kesrox.com",
          contactPhone: "+91 76965 52865",
          planTier: "CORE_LEAD_SUITE",
          status: "ACTIVE",
        },
      });
    }

    const settingsData = {
      companyName: "Kesrox Pharmaceuticals",
      companyId: company.id,
      metaAppId,
      metaAppSecret,
      metaAccessToken,
      metaApiKey: metaAccessToken,
      metaPageId,
      metaAdAccountId,
      metaWabaId,
      metaPhoneNumberId,
      enableAdsInsights: true,
      enableSocialInbox: true,
      enableLeadCenter: true,
      enableLeadsAllotment: true,
      enableLeadsIq: true,
      enableSourcesHub: true,
    };

    // 2. Update default database settings
    const existingSettings = await defaultPrisma.companySettings.findFirst({
      where: { companyId: company.id },
    });

    if (existingSettings) {
      await defaultPrisma.companySettings.update({
        where: { id: existingSettings.id },
        data: settingsData,
      });
    } else {
      await defaultPrisma.companySettings.create({
        data: {
          id: `settings_${company.id}`,
          ...settingsData,
        },
      });
    }

    // 3. Update TenantDatabase routing
    await defaultPrisma.tenantDatabase.upsert({
      where: { companyId: company.id },
      update: {
        metaPageId,
        metaWabaId,
      },
      create: {
        companyId: company.id,
        connectionString: process.env.DATABASE_URL || "",
        metaPageId,
        metaWabaId,
      },
    }).catch(() => null);

    // 4. Update tenant database if present
    try {
      const tenantPrisma = await getPrismaForCompany(company.id);
      if (tenantPrisma && tenantPrisma !== defaultPrisma) {
        const tenantExisting = await tenantPrisma.companySettings.findFirst({
          where: { companyId: company.id },
        });
        if (tenantExisting) {
          await tenantPrisma.companySettings.update({
            where: { id: tenantExisting.id },
            data: settingsData,
          });
        } else {
          await tenantPrisma.companySettings.create({
            data: { id: `settings_${company.id}`, ...settingsData },
          });
        }
      }
    } catch (e: any) {
      console.warn("Could not sync tenant DB settings:", e?.message);
    }

    // 5. Fetch & cache live Meta Ads Insights from Marketing API for Kesrox
    let liveCampaignsCount = 0;
    try {
      const campaignsUrl = `https://graph.facebook.com/v19.0/${metaAdAccountId}/campaigns?fields=id,name,status,insights.date_preset(maximum)%7Bspend,clicks,impressions,reach,ctr,date_start,actions%7D&limit=50&access_token=${metaAccessToken}`;
      const campaignsRes = await fetch(campaignsUrl);
      const campaignsJson = await campaignsRes.json();

      if (campaignsRes.ok && Array.isArray(campaignsJson.data)) {
        liveCampaignsCount = campaignsJson.data.length;

        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const campaigns = campaignsJson.data.map((c: any) => {
          const insight = c.insights?.data?.[0] || {};
          const actions: any[] = insight.actions || [];
          const leadAction = actions.find(
            (a: any) =>
              a.action_type === "onsite_conversion.total_messaging_connection" ||
              a.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
              a.action_type === "lead"
          );
          const leads = leadAction ? num(leadAction.value) : 0;

          return {
            id: c.id,
            name: c.name || "Untitled campaign",
            status: c.status || "UNKNOWN",
            spend: num(insight.spend),
            clicks: num(insight.clicks),
            impressions: num(insight.impressions),
            reach: num(insight.reach),
            ctr: num(insight.ctr),
            leads,
            startDate: insight.date_start || null,
          };
        });

        const locUrl = `https://graph.facebook.com/v19.0/${metaAdAccountId}/insights?level=account&breakdowns=region&fields=spend,clicks,impressions&date_preset=maximum&limit=30&access_token=${metaAccessToken}`;
        const locRes = await fetch(locUrl);
        const locJson = await locRes.json().catch(() => ({ data: [] }));
        const locations = locRes.ok
          ? (locJson.data || []).map((r: any) => ({
              region: r.region || "Unknown",
              spend: num(r.spend),
              clicks: num(r.clicks),
              impressions: num(r.impressions),
            }))
          : [];

        const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);
        const totalClicks = campaigns.reduce((s: number, c: any) => s + c.clicks, 0);
        const totalImpressions = campaigns.reduce((s: number, c: any) => s + c.impressions, 0);
        const totalReach = campaigns.reduce((s: number, c: any) => s + c.reach, 0);
        const totalLeads = campaigns.reduce((s: number, c: any) => s + c.leads, 0);

        const summary = {
          totalSpend,
          totalClicks,
          totalImpressions,
          totalReach,
          totalLeads,
          avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
          currency: "INR",
          campaigns: campaigns.sort((a: any, b: any) => b.spend - a.spend),
          locations: locations.sort((a: any, b: any) => b.spend - a.spend),
        };

        await defaultPrisma.adsInsightsSync.upsert({
          where: { companyId: company.id },
          update: { summary: summary as any, syncedAt: new Date(), lastError: null },
          create: { companyId: company.id, summary: summary as any, syncedAt: new Date() },
        });
      }
    } catch (e: any) {
      console.warn("Could not cache Ads Insights during Kesrox onboard:", e?.message);
    }

    return NextResponse.json({
      success: true,
      message: "Kesrox Pharmaceuticals Meta Suite API connected with permanent System User token!",
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
      },
      metaIntegration: {
        appId: metaAppId,
        pageId: metaPageId,
        adAccountId: metaAdAccountId,
        wabaId: metaWabaId,
        liveCampaignsSynced: liveCampaignsCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Kesrox onboard error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update Kesrox Meta settings" },
      { status: 500 }
    );
  }
}
