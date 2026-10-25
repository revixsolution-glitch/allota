import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { AdsInsightsView, AdsSummary } from "./AdsInsightsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ads Intelligence Desk — Allota CRM",
  description: "Live Meta Ads Manager performance, WhatsApp inquiries, and cost analytics.",
};

interface PageProps {
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>;
}

export default async function AdsInsightsPage(props: PageProps) {
  await props.searchParams;
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

  return (
    <AdsInsightsView
      summary={summary}
      syncError={sync?.lastError}
      lastSyncedAt={sync?.syncedAt?.toISOString() ?? null}
      hasAdAccountId={Boolean(settings.metaAdAccountId)}
    />
  );
}
