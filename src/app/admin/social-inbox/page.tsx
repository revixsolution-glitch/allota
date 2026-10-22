import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { SocialInboxView, SocialItemData } from "@/components/SocialInboxView";

export const dynamic = "force-dynamic";

export default async function SocialInboxPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    redirect("/login");
  }
  const activeCompanyId = getActiveCompanyId(session);

  const company = activeCompanyId
    ? await prisma.company.findUnique({
        where: { id: activeCompanyId },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
        select: { enableSocialInbox: true },
      })
    : null;

  // Ensure Kesrox and Ekonmed always have Social Inbox unlocked
  if (settings && !settings.enableSocialInbox) {
    const isTargetBrand =
      company?.slug?.includes("kesrox") ||
      company?.slug?.includes("ekonmed") ||
      company?.name?.toLowerCase().includes("kesrox") ||
      company?.name?.toLowerCase().includes("ekonmed");

    if (isTargetBrand) {
      await prisma.companySettings.updateMany({
        where: { companyId: activeCompanyId },
        data: { enableSocialInbox: true },
      });
    } else if (session.role !== "SUPER_ADMIN") {
      redirect("/admin/leads");
    }
  }

  // 1. Permanently remove all legacy seed / mock records to guarantee 100% genuine data
  if (activeCompanyId) {
    try {
      await prisma.socialInboxItem.deleteMany({
        where: {
          companyId: activeCompanyId,
          OR: [
            { externalId: { startsWith: "seed_" } },
            { externalId: { startsWith: "ekonmed_" } },
            { externalId: { startsWith: "kesrox_" } },
            { externalId: { startsWith: "mock_" } },
          ],
        },
      });
    } catch {
      // ignore
    }
  }

  // 2. Fetch only genuine live Meta interactions
  const dbItems = await prisma.socialInboxItem.findMany({
    where: { ...scopeToCompany(activeCompanyId) },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const initialItems: SocialItemData[] = dbItems.map((item) => ({
    id: item.id,
    platform: item.platform as "FACEBOOK" | "INSTAGRAM",
    kind: item.kind as "COMMENT" | "MESSAGE" | "LIKE",
    fromName: item.fromName,
    fromId: item.fromId,
    text: item.text,
    postOrThreadId: item.postOrThreadId,
    postTitle: item.postTitle,
    postThumbnail: item.postThumbnail,
    mediaType: (item.mediaType as any) || (item.isAd ? "AD" : "POST"),
    isAd: item.isAd,
    adCampaignName: item.adCampaignName,
    permalink: item.permalink,
    status: item.status as "NEW" | "REPLIED" | "IGNORED" | "SEEN",
    aiDraftReply: item.aiDraftReply,
    repliedText: item.repliedText,
    receivedAt: item.receivedAt.toISOString(),
  }));

  return (
    <SocialInboxView
      initialItems={initialItems}
      companyName={company?.name || "Allota CRM"}
    />
  );
}
