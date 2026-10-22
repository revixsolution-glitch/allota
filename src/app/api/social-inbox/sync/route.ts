import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { resolveCompanyMetaCredentials, resolvePageAccessToken } from "@/lib/tenant-credentials";

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

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findFirst({
    where: { companyId: activeCompanyId },
    select: {
      metaPageId: true,
      metaAccessToken: true,
      metaApiKey: true,
      enableSocialInbox: true,
    },
  });

  // 1. Purge legacy seed/mock records permanently so only genuine data remains
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
  } catch (err) {
    console.warn("[Social Inbox] Purge seed records:", err);
  }

  // 2. Strict Tenant Credential Resolution
  // Guarantees zero cross-firm leakage: Kesrox only syncs Kesrox, Ekonmed only syncs Ekonmed,
  // and other tenants must supply their own credentials.
  const creds = resolveCompanyMetaCredentials(company, settings);

  if (!creds.isConfigured || !creds.pageId || !creds.systemToken) {
    const isDemo =
      !company?.slug ||
      company.slug === "pharma-life" ||
      company.slug === "pharma-life-sciences" ||
      company.name?.includes("Allota");

    return NextResponse.json({
      success: false,
      isDemo,
      error:
        creds.unconfiguredReason ||
        (isDemo
          ? "Demo presentation account: No live Meta Page is connected. To view genuine live comments & DMs, switch to an active client (e.g. Kesrox or Ekonmed) or add your company's Meta Page ID & Token in Settings → Meta Suite."
          : `Meta Access Token or Page ID is missing for ${company.name}. Under our tenant safety policy, this company cannot use another business's API or credentials. Please configure your credentials under Settings → Meta Suite.`),
      pageId: creds.pageId,
      hasToken: Boolean(creds.systemToken),
      syncedLiveCount: 0,
      totalItems: 0,
      items: [],
    });
  }

  const { pageId, systemToken } = creds;
  let syncedLiveCount = 0;
  let lastError: string | null = null;

  // 3. Exchange System User token for the authorized Page Access Token
  const effectivePageToken = await resolvePageAccessToken(pageId, systemToken);

  // 4. Fetch genuine live data from Meta Graph API
  // A. Facebook Page Feed (Posts, Comments, Likes)
  try {
    const feedRes = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed?fields=id,message,status_type,created_time,permalink_url,full_picture,comments.limit(25){id,from,message,created_time},likes.summary(true).limit(25){id,name}&limit=20&access_token=${effectivePageToken}`
    );

    if (feedRes.ok) {
      const feedData = await feedRes.json();
      for (const post of feedData.data || []) {
        const postTitle = post.message?.slice(0, 120) || "Facebook Page Post";
        const postThumbnail = post.full_picture || null;
        const permalink = post.permalink_url || `https://facebook.com/${post.id}`;
        const isReel = post.status_type === "added_video" || (post.message || "").toLowerCase().includes("reel");
        const isAd = (post.message || "").toLowerCase().includes("ad") || (post.status_type || "").includes("promoted");
        const mediaType = isAd ? "AD" : isReel ? "REEL" : "POST";

        // Ingest live comments
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
                mediaType,
                isAd,
                adCampaignName: isAd ? "Meta Sponsored Post" : null,
                permalink,
                receivedAt: new Date(c.created_time || Date.now()),
              },
            });
            syncedLiveCount++;
          }
        }

        // Ingest live likes
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
                mediaType,
                isAd,
                adCampaignName: isAd ? "Meta Sponsored Post" : null,
                permalink,
                receivedAt: new Date(post.created_time || Date.now()),
              },
            });
            syncedLiveCount++;
          }
        }
      }
    } else {
      const errJson = await feedRes.json().catch(() => ({}));
      lastError = errJson?.error?.message || `Meta Graph API HTTP ${feedRes.status}`;
      console.warn("[Social Inbox Sync] Facebook Graph API error:", lastError);
    }
  } catch (err: any) {
    lastError = err?.message || "Failed to reach Meta Graph API";
    console.warn("[Social Inbox Sync] Facebook network error:", err);
  }

  // B. Connected Instagram Business Account (Media & Comments)
  try {
    const pageRes = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${systemToken}`
    );
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const igId = pageData.instagram_business_account?.id;
      if (igId) {
        const mediaRes = await fetch(
          `https://graph.facebook.com/v19.0/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments.limit(25){id,username,text,timestamp},like_count&limit=15&access_token=${effectivePageToken}`
        );
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          for (const media of mediaData.data || []) {
            const postTitle = media.caption?.slice(0, 120) || "Instagram Media Post";
            const postThumbnail = media.thumbnail_url || media.media_url || null;
            const permalink = media.permalink || `https://instagram.com/p/${media.id}`;
            const isReel = media.media_type === "VIDEO" || (media.caption || "").toLowerCase().includes("reel");

            for (const c of media.comments?.data || []) {
              const existing = await prisma.socialInboxItem.findUnique({
                where: { externalId: c.id },
              });

              if (!existing) {
                await prisma.socialInboxItem.create({
                  data: {
                    companyId: activeCompanyId,
                    platform: "INSTAGRAM",
                    kind: "COMMENT",
                    externalId: c.id,
                    fromName: c.username || "Instagram User",
                    fromId: null,
                    text: c.text,
                    postOrThreadId: media.id,
                    postTitle,
                    postThumbnail,
                    mediaType: isReel ? "REEL" : "POST",
                    isAd: false,
                    permalink,
                    receivedAt: new Date(c.timestamp || Date.now()),
                  },
                });
                syncedLiveCount++;
              }
            }
          }
        }
      }
    }
  } catch (igErr: any) {
    console.warn("[Social Inbox Sync] Instagram fetch notice:", igErr?.message);
  }

  // 5. Return genuine live items for this company ONLY
  const allItems = await prisma.socialInboxItem.findMany({
    where: { ...scopeToCompany(activeCompanyId) },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    companyName: company.name,
    pageId,
    syncedLiveCount,
    totalItems: allItems.length,
    items: allItems,
    warning: lastError,
  });
}
