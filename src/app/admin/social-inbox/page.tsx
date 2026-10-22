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

  // Fetch social inbox items
  let dbItems = await prisma.socialInboxItem.findMany({
    where: { ...scopeToCompany(activeCompanyId) },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  // If newly enabled and empty, seed initial high-value PCD franchise interactions with creatives
  if (dbItems.length === 0 && activeCompanyId) {
    const isEkonmed =
      company?.name?.toLowerCase().includes("ekonmed") ||
      company?.slug?.includes("ekonmed");
    const brandName = isEkonmed ? "Ekonmed Remedies" : "Kesrox Pharmaceuticals";

    const starterItems = isEkonmed
      ? [
          {
            platform: "INSTAGRAM",
            kind: "COMMENT",
            externalId: `seed_ekonmed_c1`,
            fromName: "dr_sandeep_patna",
            fromId: "ig_usr_101",
            text: "Interested in PCD Franchise monopoly rights for Patna district. Please share catalogue & price list on WhatsApp.",
            postOrThreadId: "ig_ad_901",
            postTitle: `${brandName} — Derma & Cardiac Diabetic PCD Franchise 2026. 100% Monopoly Rights & Marketing Bags.`,
            postThumbnail: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop&q=80",
            mediaType: "AD",
            isAd: true,
            adCampaignName: "Derma & Diabetic PCD Franchise - Bihar & UP",
            permalink: "https://instagram.com/p/ekonmed_derma_launch",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 35),
          },
          {
            platform: "INSTAGRAM",
            kind: "LIKE",
            externalId: `seed_ekonmed_l1`,
            fromName: "pharma_distributors_up",
            fromId: "ig_usr_102",
            text: "❤️ Liked your Instagram Reel",
            postOrThreadId: "ig_reel_902",
            postTitle: `${brandName} — Inside our WHO-GMP Certified sterile liquid syrup & injectable plant! 🚀`,
            postThumbnail: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&auto=format&fit=crop&q=80",
            mediaType: "REEL",
            isAd: false,
            adCampaignName: null,
            permalink: "https://instagram.com/reel/ekonmed_plant_tour",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 52),
          },
          {
            platform: "FACEBOOK",
            kind: "MESSAGE",
            externalId: `seed_ekonmed_m1`,
            fromName: "Amitabh Verma (Bareilly Chemist)",
            fromId: "fb_msg_201",
            text: "Namaste team, we run a retail and wholesale counter in Bareilly. Want to take distributorship for syrup and tablet division. What is the MOQ?",
            postOrThreadId: "thread_bareilly_01",
            postTitle: "Facebook Messenger Direct Inquiry",
            postThumbnail: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80",
            mediaType: "POST",
            isAd: false,
            adCampaignName: null,
            permalink: null,
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 110),
          },
          {
            platform: "FACEBOOK",
            kind: "COMMENT",
            externalId: `seed_ekonmed_c2`,
            fromName: "Pooja Gupta",
            fromId: "fb_usr_202",
            text: "Sir monopoly available in Gorakhpur? Need urgent dispatch for new clinic setup.",
            postOrThreadId: "fb_ad_802",
            postTitle: `${brandName} — Antibiotic & Injectable Range with High Margin Support for Franchise Partners.`,
            postThumbnail: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
            mediaType: "AD",
            isAd: true,
            adCampaignName: "Click-to-WhatsApp Antibiotics & Injectables",
            permalink: "https://facebook.com/ekonmed/posts/802",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 240),
          },
          {
            platform: "FACEBOOK",
            kind: "LIKE",
            externalId: `seed_ekonmed_l2`,
            fromName: "Kalyan Medical Hall",
            fromId: "fb_usr_203",
            text: "👍 Liked your Post",
            postOrThreadId: "fb_post_803",
            postTitle: `${brandName} — Free Promotional Material Kit: MR Bags, Visual Aids & Sample Sets Included.`,
            postThumbnail: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&auto=format&fit=crop&q=80",
            mediaType: "POST",
            isAd: false,
            adCampaignName: null,
            permalink: "https://facebook.com/ekonmed/posts/803",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 300),
          },
        ]
      : [
          {
            platform: "FACEBOOK",
            kind: "COMMENT",
            externalId: `seed_kesrox_c1`,
            fromName: "Dr. Rajesh Sharma",
            fromId: "fb_usr_101",
            text: "Please send product catalogue and monopoly details for Ambala & Kurukshetra districts.",
            postOrThreadId: "fb_ad_701",
            postTitle: `${brandName} — Over 450+ WHO-GMP Certified Formulations with Strict District Monopoly Rights.`,
            postThumbnail: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
            mediaType: "AD",
            isAd: true,
            adCampaignName: "PCD Monopoly Haryana & Punjab Meta Ad",
            permalink: "https://facebook.com/kesrox/posts/701",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 25),
          },
          {
            platform: "FACEBOOK",
            kind: "LIKE",
            externalId: `seed_kesrox_l1`,
            fromName: "Vikas Pharma Agencies",
            fromId: "fb_usr_102",
            text: "❤️ Loved your PCD Franchise post",
            postOrThreadId: "fb_ad_701",
            postTitle: `${brandName} — Over 450+ WHO-GMP Certified Formulations with Strict District Monopoly Rights.`,
            postThumbnail: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
            mediaType: "AD",
            isAd: true,
            adCampaignName: "PCD Monopoly Haryana & Punjab Meta Ad",
            permalink: "https://facebook.com/kesrox/posts/701",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 45),
          },
          {
            platform: "INSTAGRAM",
            kind: "MESSAGE",
            externalId: `seed_kesrox_m1`,
            fromName: "sanjay_medicos_karnal",
            fromId: "ig_usr_201",
            text: "Hello Sir, we are interested in antibiotic injectable monopoly in Karnal. What is the minimum billing requirement to start?",
            postOrThreadId: "thread_karnal_01",
            postTitle: "Instagram Direct Message (DM)",
            postThumbnail: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80",
            mediaType: "POST",
            isAd: false,
            adCampaignName: null,
            permalink: null,
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 95),
          },
          {
            platform: "INSTAGRAM",
            kind: "COMMENT",
            externalId: `seed_kesrox_c2`,
            fromName: "priyanka_health_hub",
            fromId: "ig_usr_202",
            text: "Does the company provide visual aids, reminder cards and sample kit?",
            postOrThreadId: "ig_post_702",
            postTitle: `${brandName} — Free Promotional Material Kit with Every PCD Franchise Order.`,
            postThumbnail: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&auto=format&fit=crop&q=80",
            mediaType: "POST",
            isAd: false,
            adCampaignName: null,
            permalink: "https://instagram.com/p/kesrox_promotional_kit",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 180),
          },
          {
            platform: "INSTAGRAM",
            kind: "LIKE",
            externalId: `seed_kesrox_l2`,
            fromName: "haryana_medicine_traders",
            fromId: "ig_usr_203",
            text: "❤️ Liked your Reel",
            postOrThreadId: "ig_reel_703",
            postTitle: `${brandName} — 1-Minute Reel: Watch our fast 24-Hour Dispatch Process from Warehouse! 📦`,
            postThumbnail: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&auto=format&fit=crop&q=80",
            mediaType: "REEL",
            isAd: false,
            adCampaignName: null,
            permalink: "https://instagram.com/reel/kesrox_warehouse_dispatch",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 210),
          },
        ];

    for (const item of starterItems) {
      await prisma.socialInboxItem.create({
        data: {
          companyId: activeCompanyId,
          ...item,
        },
      });
    }

    dbItems = await prisma.socialInboxItem.findMany({
      where: { ...scopeToCompany(activeCompanyId) },
      orderBy: { receivedAt: "desc" },
      take: 100,
    });
  }

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
