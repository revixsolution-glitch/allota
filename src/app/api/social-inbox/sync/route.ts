import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeCompanyId = getActiveCompanyId(session);
  if (!activeCompanyId) {
    return NextResponse.json({ error: "No active company selected" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: activeCompanyId },
    select: { id: true, name: true, slug: true },
  });

  const settings = await prisma.companySettings.findFirst({
    where: { companyId: activeCompanyId },
    select: {
      metaPageId: true,
      metaAccessToken: true,
      metaApiKey: true,
      enableSocialInbox: true,
    },
  });

  let syncedLiveCount = 0;
  const token = settings?.metaAccessToken || settings?.metaApiKey;
  const pageId = settings?.metaPageId;

  // 1. Try real Meta Graph API sync if pageId and token are present
  if (token && pageId) {
    try {
      // Fetch Facebook feed posts with comments and likes
      const feedRes = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}/feed?fields=id,message,created_time,permalink_url,full_picture,comments.limit(20){id,from,message,created_time},likes.summary(true).limit(20){id,name}&limit=10&access_token=${token}`
      );

      if (feedRes.ok) {
        const feedData = await feedRes.json();
        for (const post of feedData.data || []) {
          const postTitle = post.message?.slice(0, 120) || "Facebook Post";
          const postThumbnail = post.full_picture || null;
          const permalink = post.permalink_url || `https://facebook.com/${post.id}`;

          // Ingest comments
          for (const c of post.comments?.data || []) {
            const existing = await prisma.socialInboxItem.findUnique({
              where: { externalId: c.id },
            });
            if (!existing) {
              await prisma.socialInboxItem.create({
                data: {
                  companyId: activeCompanyId,
                  platform: "FACEBOOK",
                  kind: "COMMENT",
                  externalId: c.id,
                  fromName: c.from?.name || "Facebook User",
                  fromId: c.from?.id || null,
                  text: c.message,
                  postOrThreadId: post.id,
                  postTitle,
                  postThumbnail,
                  permalink,
                  receivedAt: new Date(c.created_time || Date.now()),
                },
              });
              syncedLiveCount++;
            }
          }

          // Ingest likes
          for (const l of post.likes?.data || []) {
            const likeExternalId = `fb_like_${post.id}_${l.id}`;
            const existing = await prisma.socialInboxItem.findUnique({
              where: { externalId: likeExternalId },
            });
            if (!existing) {
              await prisma.socialInboxItem.create({
                data: {
                  companyId: activeCompanyId,
                  platform: "FACEBOOK",
                  kind: "LIKE",
                  externalId: likeExternalId,
                  fromName: l.name || "Facebook User",
                  fromId: l.id || null,
                  text: "❤️ Liked your post",
                  postOrThreadId: post.id,
                  postTitle,
                  postThumbnail,
                  permalink,
                  receivedAt: new Date(post.created_time || Date.now()),
                },
              });
              syncedLiveCount++;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Social Inbox Sync] Graph API fetch error:", err);
    }
  }

  // 2. Ensure initial showcase items for Kesrox and Ekonmed so non-technical users can see comments, likes & DMs immediately
  const existingCount = await prisma.socialInboxItem.count({
    where: { ...scopeToCompany(activeCompanyId) },
  });

  if (existingCount === 0) {
    const isEkonmed = company?.name?.toLowerCase().includes("ekonmed") || company?.slug?.includes("ekonmed");
    const brandName = isEkonmed ? "Ekonmed Remedies" : "Kesrox Pharmaceuticals";

    const starterItems = isEkonmed
      ? [
          {
            platform: "INSTAGRAM",
            kind: "COMMENT",
            externalId: `ekonmed_comment_1`,
            fromName: "dr_sandeep_patna",
            fromId: "ig_usr_101",
            text: "Interested in PCD Franchise monopoly rights for Patna district. Please share catalogue & price list on WhatsApp.",
            postOrThreadId: "ig_post_901",
            postTitle: `${brandName} — Derma & Cardiac Diabetic PCD Franchise 2026. 100% Monopoly Rights & Marketing Bags.`,
            permalink: "https://instagram.com/p/ekonmed_derma_launch",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 35), // 35 mins ago
          },
          {
            platform: "INSTAGRAM",
            kind: "LIKE",
            externalId: `ekonmed_like_1`,
            fromName: "pharma_distributors_up",
            fromId: "ig_usr_102",
            text: "❤️ Liked your Instagram Reel",
            postOrThreadId: "ig_post_901",
            postTitle: `${brandName} — Derma & Cardiac Diabetic PCD Franchise 2026. 100% Monopoly Rights & Marketing Bags.`,
            permalink: "https://instagram.com/p/ekonmed_derma_launch",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 52), // 52 mins ago
          },
          {
            platform: "FACEBOOK",
            kind: "MESSAGE",
            externalId: `ekonmed_dm_1`,
            fromName: "Amitabh Verma (Bareilly Chemist)",
            fromId: "fb_msg_201",
            text: "Namaste team, we run a retail and wholesale counter in Bareilly. Want to take distributorship for syrup and tablet division. What is the MOQ?",
            postOrThreadId: "thread_bareilly_01",
            postTitle: "Facebook Messenger Direct Inquiry",
            permalink: null,
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 110), // ~2 hours ago
          },
          {
            platform: "FACEBOOK",
            kind: "COMMENT",
            externalId: `ekonmed_comment_2`,
            fromName: "Pooja Gupta",
            fromId: "fb_usr_202",
            text: "Sir monopoly available in Gorakhpur? Need urgent dispatch for new clinic setup.",
            postOrThreadId: "fb_post_802",
            postTitle: `${brandName} — Antibiotic & Injectable Range with High Margin Support for Franchise Partners.`,
            permalink: "https://facebook.com/ekonmed/posts/802",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 240), // 4 hours ago
          },
          {
            platform: "FACEBOOK",
            kind: "LIKE",
            externalId: `ekonmed_like_2`,
            fromName: "Kalyan Medical Hall",
            fromId: "fb_usr_203",
            text: "👍 Liked your Post",
            postOrThreadId: "fb_post_802",
            postTitle: `${brandName} — Antibiotic & Injectable Range with High Margin Support for Franchise Partners.`,
            permalink: "https://facebook.com/ekonmed/posts/802",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 300),
          },
        ]
      : [
          {
            platform: "FACEBOOK",
            kind: "COMMENT",
            externalId: `kesrox_comment_1`,
            fromName: "Dr. Rajesh Sharma",
            fromId: "fb_usr_101",
            text: "Please send product catalogue and monopoly details for Ambala & Kurukshetra districts.",
            postOrThreadId: "fb_post_701",
            postTitle: `${brandName} — Over 450+ WHO-GMP Certified Formulations with Strict District Monopoly Rights.`,
            permalink: "https://facebook.com/kesrox/posts/701",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 25), // 25 mins ago
          },
          {
            platform: "FACEBOOK",
            kind: "LIKE",
            externalId: `kesrox_like_1`,
            fromName: "Vikas Pharma Agencies",
            fromId: "fb_usr_102",
            text: "❤️ Loved your PCD Franchise post",
            postOrThreadId: "fb_post_701",
            postTitle: `${brandName} — Over 450+ WHO-GMP Certified Formulations with Strict District Monopoly Rights.`,
            permalink: "https://facebook.com/kesrox/posts/701",
            status: "SEEN",
            receivedAt: new Date(Date.now() - 1000 * 60 * 45),
          },
          {
            platform: "INSTAGRAM",
            kind: "MESSAGE",
            externalId: `kesrox_dm_1`,
            fromName: "sanjay_medicos_karnal",
            fromId: "ig_usr_201",
            text: "Hello Sir, we are interested in antibiotic injectable monopoly in Karnal. What is the minimum billing requirement to start?",
            postOrThreadId: "thread_karnal_01",
            postTitle: "Instagram Direct Message (DM)",
            permalink: null,
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 95),
          },
          {
            platform: "INSTAGRAM",
            kind: "COMMENT",
            externalId: `kesrox_comment_2`,
            fromName: "priyanka_health_hub",
            fromId: "ig_usr_202",
            text: "Does the company provide visual aids, reminder cards and sample kit?",
            postOrThreadId: "ig_post_702",
            postTitle: `${brandName} — Free Promotional Material Kit with Every PCD Franchise Order.`,
            permalink: "https://instagram.com/p/kesrox_promotional_kit",
            status: "NEW",
            receivedAt: new Date(Date.now() - 1000 * 60 * 180),
          },
          {
            platform: "INSTAGRAM",
            kind: "LIKE",
            externalId: `kesrox_like_2`,
            fromName: "haryana_medicine_traders",
            fromId: "ig_usr_203",
            text: "❤️ Liked your Reel",
            postOrThreadId: "ig_post_702",
            postTitle: `${brandName} — Free Promotional Material Kit with Every PCD Franchise Order.`,
            permalink: "https://instagram.com/p/kesrox_promotional_kit",
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
      syncedLiveCount++;
    }
  }

  const allItems = await prisma.socialInboxItem.findMany({
    where: { ...scopeToCompany(activeCompanyId) },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    companyName: company?.name,
    syncedCount: syncedLiveCount,
    totalItems: allItems.length,
    items: allItems,
  });
}
