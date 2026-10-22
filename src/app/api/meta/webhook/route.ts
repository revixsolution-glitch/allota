import { NextRequest, NextResponse } from "next/server";
import { prisma, defaultPrisma, warmTenantClient } from "@/lib/prisma";
import { setTenantContext } from "@/lib/tenant-context";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { extractPhoneNumber, normalizePhoneKey } from "@/lib/phone-utils";
import { pickNextEmployeeForSource } from "@/lib/lead-assignment";

export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "allota_meta_verify_token";

/**
 * Meta Webhook Verification (GET)
 * Used by Meta Developers to verify the webhook URL.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Meta Webhook] Verification successful!");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * Finds which company owns a Meta Page id, and points every `prisma.*` call
 * for the rest of this event at that company's own database (via the
 * TenantDatabase routing table). A company with no TenantDatabase row uses
 * the shared default database, matched there by an EXACT pageId — never a
 * loose fallback to "any company with a token set", which would silently
 * misattribute a lead to the wrong company.
 *
 * Returns null if no company owns this pageId — the caller must skip the
 * lead rather than guess.
 */
async function routeToCompanyForPage(
  pageId: string
): Promise<{ companyId: string; accessToken: string | null } | null> {
  // Matches by Page id OR WhatsApp Business Account id — Meta sends
  // whichever one identifies the object the event happened on (a Facebook
  // Page for leads/comments, sometimes the WABA id for WhatsApp events).
  const routed = await defaultPrisma.tenantDatabase
    .findFirst({ where: { OR: [{ metaPageId: pageId }, { metaWabaId: pageId }] }, select: { companyId: true } })
    .catch(() => null);

  if (routed) {
    setTenantContext(routed.companyId);
    await warmTenantClient(routed.companyId);
    const settings = await prisma.companySettings.findFirst({
      where: { companyId: routed.companyId },
      select: { metaAccessToken: true, metaApiKey: true },
    });
    return { companyId: routed.companyId, accessToken: settings?.metaAccessToken || settings?.metaApiKey || null };
  }

  const settings = await defaultPrisma.companySettings.findFirst({
    where: { OR: [{ metaPageId: pageId }, { metaWabaId: pageId }, { metaPhoneNumberId: pageId }] },
    select: { companyId: true, metaAccessToken: true, metaApiKey: true },
  });
  if (!settings?.companyId) return null;

  setTenantContext(settings.companyId);
  await warmTenantClient(settings.companyId);
  return { companyId: settings.companyId, accessToken: settings.metaAccessToken || settings.metaApiKey || null };
}

/** Save a comment, like, or message into the Social Inbox, only if the company has the add-on enabled. Ignores an event already captured (Meta retries webhook deliveries). */
async function captureSocialInboxItem(companyId: string, item: {
  platform: "FACEBOOK" | "INSTAGRAM";
  kind: "COMMENT" | "MESSAGE" | "LIKE";
  externalId: string;
  fromName?: string | null;
  fromId?: string | null;
  text?: string | null;
  postOrThreadId?: string | null;
  postTitle?: string | null;
  postThumbnail?: string | null;
  mediaType?: "POST" | "REEL" | "AD" | "STORY" | null;
  isAd?: boolean;
  adCampaignName?: string | null;
  permalink?: string | null;
}) {
  const settings = await prisma.companySettings.findFirst({
    where: { companyId },
    select: { enableSocialInbox: true },
  });
  if (!settings?.enableSocialInbox) return;

  const existing = await prisma.socialInboxItem.findUnique({ where: { externalId: item.externalId } });
  if (existing) return;

  await prisma.socialInboxItem.create({
    data: { companyId, ...item },
  });
}

/**
 * Meta Real-Time Lead Event Receiver (POST)
 * Triggered automatically by Meta when a prospect submits a Facebook or Instagram Lead Ad.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || (body.object !== "page" && body.object !== "whatsapp_business_account")) {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    // =========================================================================
    // 1. WhatsApp Cloud API (Click-to-WhatsApp Ads & Direct WhatsApp Inquiries)
    // =========================================================================
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry || []) {
        const wabaId = entry.id;

        for (const change of entry.changes || []) {
          if (change.field === "messages" && change.value?.messages) {
            const phoneId = change.value.metadata?.phone_number_id;
            const routed =
              (await routeToCompanyForPage(wabaId)) ||
              (phoneId ? await routeToCompanyForPage(phoneId) : null);
            if (!routed) {
              console.warn(
                `[WhatsApp Webhook] No company configured for WABA ID ${wabaId} or Phone Number ID ${phoneId}`
              );
              continue;
            }

            const contacts = change.value.contacts || [];
            const contactMap = new Map<string, string>();
            for (const c of contacts) {
              if (c.wa_id && c.profile?.name) {
                contactMap.set(c.wa_id, c.profile.name);
              }
            }

            for (const msg of change.value.messages) {
              if (msg.type === "system") continue;

              const rawPhone = msg.from ? `+${msg.from}` : null;
              const parsedPhone = extractPhoneNumber(rawPhone);
              const formattedPhone = parsedPhone ? parsedPhone.formatted : rawPhone;
              const phoneKey = normalizePhoneKey(rawPhone);

              const senderName = contactMap.get(msg.from) || "WhatsApp Prospect";
              const messageText = msg.text?.body || `[${msg.type || "Inquiry"} received on WhatsApp]`;

              // Check if message originated from a Click-to-WhatsApp Ad
              const referral = msg.referral;
              const isAd = Boolean(referral);
              const sourceTag = isAd
                ? `Meta WhatsApp Ad (${referral.headline || referral.source_id || "Direct"})`
                : "Direct WhatsApp Message";

              // Check if prospect already exists (Zero-Duplicate Guarantee)
              let existingLead: { id: string; inquiryDetails: string | null } | null = null;
              if (phoneKey) {
                const companyLeads = await prisma.lead.findMany({
                  where: {
                    phoneNumber: { not: null },
                    companyId: routed.companyId,
                  },
                  select: { id: true, phoneNumber: true, inquiryDetails: true },
                });

                existingLead =
                  companyLeads.find((l) => normalizePhoneKey(l.phoneNumber) === phoneKey) || null;
              }

              if (existingLead) {
                const inquiryUpdate = `${existingLead.inquiryDetails || ""}\n[WhatsApp Message ${new Date().toLocaleDateString()}] ${
                  isAd ? `Ad Referral: "${referral?.headline || referral?.source_id}". ` : ""
                }"${messageText}"`.trim();
                await prisma.lead.update({
                  where: { id: existingLead.id },
                  data: {
                    inquiryDetails: inquiryUpdate,
                    rawPayload: msg,
                  },
                });
                console.log(`[WhatsApp Webhook] Existing lead updated: ${senderName} (${formattedPhone})`);
                continue;
              }

              // Round-robin assign to sales representatives
              const autoAssignedEmployeeId =
                (await pickNextEmployeeForSource(routed.companyId, LeadSource.WHATSAPP)) ||
                (await pickNextEmployeeForSource(routed.companyId, LeadSource.META));

              const inquiryDetails = isAd
                ? `Inquiry via Click-to-WhatsApp Ad.\nAd Headline: ${referral.headline || "N/A"}\nMessage: "${messageText}"`
                : `WhatsApp Direct Inquiry:\n"${messageText}"`;

              const newLead = await prisma.lead.create({
                data: {
                  companyId: routed.companyId,
                  name: senderName,
                  phoneNumber: formattedPhone,
                  source: LeadSource.WHATSAPP,
                  sourceTag,
                  division: "PCD_FRANCHISE",
                  status: autoAssignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
                  assignedEmployeeId: autoAssignedEmployeeId,
                  inquiryDetails,
                  rawPayload: msg,
                },
              });

              if (autoAssignedEmployeeId) {
                await prisma.leadReassignmentLog.create({
                  data: {
                    leadId: newLead.id,
                    fromEmployeeId: null,
                    toEmployeeId: autoAssignedEmployeeId,
                    reason: "Auto-assigned via round-robin (WhatsApp Ads source)",
                    previousStatus: "NEW",
                    newStatus: "ASSIGNED",
                  },
                });
              }

              console.log(`[WhatsApp Webhook] Ingested new WhatsApp lead: ${senderName} (${formattedPhone})`);
            }
          }
        }
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // =========================================================================
    // 2. Facebook / Instagram Page (Lead Ads, Comments & Messenger DMs)
    // =========================================================================
    // Process each leadgen / comment / message event
    for (const entry of body.entry || []) {
      const pageId = entry.id;

      for (const change of entry.changes || []) {
        // Facebook Page comment (a comment on a post or an ad).
        if (change.field === "feed" && change.value?.item === "comment" && change.value?.verb === "add") {
          const routed = await routeToCompanyForPage(pageId);
          if (routed) {
            const postId = change.value.post_id || change.value.parent_id || null;
            await captureSocialInboxItem(routed.companyId, {
              platform: "FACEBOOK",
              kind: "COMMENT",
              externalId: change.value.comment_id,
              fromName: change.value.from?.name || "Facebook User",
              fromId: change.value.from?.id || null,
              text: change.value.message || null,
              postOrThreadId: postId,
              postTitle: change.value.post?.message || "Facebook Page Post",
              permalink: postId ? `https://facebook.com/${postId}` : null,
            });
          }
          continue;
        }

        // Facebook Page Post Like / Reaction
        if (
          change.field === "feed" &&
          (change.value?.item === "like" || change.value?.item === "reaction") &&
          change.value?.verb === "add"
        ) {
          const routed = await routeToCompanyForPage(pageId);
          if (routed) {
            const postId = change.value.post_id || null;
            const rType = change.value.reaction_type || "like";
            const rIcon = rType === "love" ? "❤️ Loved" : rType === "wow" ? "😮 Wowed" : "👍 Liked";
            await captureSocialInboxItem(routed.companyId, {
              platform: "FACEBOOK",
              kind: "LIKE",
              externalId: `fb_like_${change.value.post_id}_${change.value.from?.id || change.value.user_id || Date.now()}`,
              fromName: change.value.from?.name || "Facebook Prospect",
              fromId: change.value.from?.id || change.value.user_id || null,
              text: `${rIcon} your post`,
              postOrThreadId: postId,
              postTitle: change.value.post?.message || "Facebook Page Post",
              permalink: postId ? `https://facebook.com/${postId}` : null,
            });
          }
          continue;
        }

        // Instagram comment
        if (change.field === "comments") {
          const routed = await routeToCompanyForPage(pageId);
          if (routed) {
            const mediaId = change.value?.media?.id || null;
            await captureSocialInboxItem(routed.companyId, {
              platform: "INSTAGRAM",
              kind: "COMMENT",
              externalId: change.value?.id,
              fromName: change.value?.from?.username || "Instagram User",
              fromId: change.value?.from?.id || null,
              text: change.value?.text || null,
              postOrThreadId: mediaId,
              postTitle: change.value?.media?.caption || "Instagram Post",
              permalink: change.value?.media?.permalink || (mediaId ? `https://instagram.com/p/${mediaId}` : null),
            });
          }
          continue;
        }

        // Instagram like
        if (change.field === "likes") {
          const routed = await routeToCompanyForPage(pageId);
          if (routed) {
            const mediaId = change.value?.media?.id || null;
            await captureSocialInboxItem(routed.companyId, {
              platform: "INSTAGRAM",
              kind: "LIKE",
              externalId: `ig_like_${mediaId}_${change.value?.from?.id || Date.now()}`,
              fromName: change.value?.from?.username || "Instagram Prospect",
              fromId: change.value?.from?.id || null,
              text: "❤️ Liked your Instagram post",
              postOrThreadId: mediaId,
              postTitle: change.value?.media?.caption || "Instagram Post",
              permalink: change.value?.media?.permalink || (mediaId ? `https://instagram.com/p/${mediaId}` : null),
            });
          }
          continue;
        }

        if (change.field === "leadgen") {
          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;

          if (!leadgenId) continue;

          // 1. Find which company this Page belongs to, and point every
          // `prisma.*` call below at that company's own database.
          const routed = await routeToCompanyForPage(pageId);
          if (!routed) {
            console.warn(`[Meta Webhook] No company is configured for Page ${pageId} — lead ${leadgenId} skipped, not attributed to anyone.`);
            continue;
          }
          const accessToken = routed.accessToken || process.env.META_ACCESS_TOKEN;

          if (!accessToken) {
            console.warn(`[Meta Webhook] No access token available for page ${pageId}`);
            continue;
          }

          // 2. Fetch full lead details from Meta Graph API
          const metaRes = await fetch(
            `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${accessToken}`
          );

          if (!metaRes.ok) {
            console.error(`[Meta Webhook] Failed to fetch lead ${leadgenId} from Graph API:`, await metaRes.text());
            continue;
          }

          const leadData = await metaRes.json();
          const fieldData: Record<string, string> = {};

          for (const item of leadData.field_data || []) {
            fieldData[item.name] = Array.isArray(item.values) ? item.values[0] : String(item.values);
          }

          const fullName =
            fieldData["full_name"] ||
            fieldData["name"] ||
            `${fieldData["first_name"] || ""} ${fieldData["last_name"] || ""}`.trim() ||
            "Meta Ad Prospect";

          const rawPhoneNumber =
            fieldData["phone_number"] ||
            fieldData["phone"] ||
            fieldData["contact_number"] ||
            null;

          const parsedPhone = extractPhoneNumber(rawPhoneNumber);
          const phoneKey = normalizePhoneKey(rawPhoneNumber);
          const formattedPhone = parsedPhone ? parsedPhone.formatted : rawPhoneNumber;

          const city = fieldData["city"] || fieldData["location"] || null;
          const state = fieldData["state"] || null;
          const email = fieldData["email"] || null;

          // Check if prospect already exists in company CRM (Zero-Duplicate Guarantee)
          let existingLead: { id: string; inquiryDetails: string | null } | null = null;
          if (phoneKey) {
            const companyLeads = await prisma.lead.findMany({
              where: {
                phoneNumber: { not: null },
                companyId: routed.companyId,
              },
              select: { id: true, phoneNumber: true, inquiryDetails: true },
            });

            existingLead = companyLeads.find(
              (l) => normalizePhoneKey(l.phoneNumber) === phoneKey
            ) || null;
          }

          if (existingLead) {
            // Do NOT create duplicate lead! Update the existing lead with latest Meta interaction
            const inquiryUpdate = `${existingLead.inquiryDetails || ""}\n[Repeat Meta Ad Submission ${new Date().toLocaleDateString()}] Form: ${formId || "Direct"}. Email: ${email || "N/A"}. Meta Lead ID: ${leadgenId}`.trim();
            await prisma.lead.update({
              where: { id: existingLead.id },
              data: {
                inquiryDetails: inquiryUpdate,
                rawPayload: leadData,
              },
            });
            console.log(`[Meta Webhook] Repeat prospect ${fullName} (${formattedPhone}) updated on existing Lead ${existingLead.id} - Zero-Duplicate Guarantee upheld.`);
            continue;
          }

          // 3. Round-robin the lead to whichever employees the admin dedicated to Meta
          const autoAssignedEmployeeId = await pickNextEmployeeForSource(
            routed.companyId,
            LeadSource.META
          );

          // 4. Ingest new verified lead into CRM Lead Center
          const newLead = await prisma.lead.create({
            data: {
              companyId: routed.companyId,
              name: fullName,
              phoneNumber: formattedPhone,
              city,
              state,
              source: LeadSource.META,
              sourceTag: `Meta Lead Ad (Form: ${formId || "Direct"})`,
              division: "PCD_FRANCHISE",
              status: autoAssignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
              assignedEmployeeId: autoAssignedEmployeeId,
              inquiryDetails: `Facebook / Instagram PCD Inquiry. Email: ${email || "N/A"}. Meta Lead ID: ${leadgenId}`,
              rawPayload: leadData,
            },
          });

          if (autoAssignedEmployeeId) {
            await prisma.leadReassignmentLog.create({
              data: {
                leadId: newLead.id,
                fromEmployeeId: null,
                toEmployeeId: autoAssignedEmployeeId,
                reason: "Auto-assigned via round-robin (Meta Ads source)",
                previousStatus: "NEW",
                newStatus: "ASSIGNED",
              },
            });
          }

          console.log(`[Meta Webhook] Successfully ingested new lead: ${fullName} (${formattedPhone})`);
        }
      }

      // Messenger / Instagram DM messages arrive as their own array on the
      // entry, not inside `changes`.
      for (const msg of entry.messaging || []) {
        if (!msg.message?.text || msg.message?.is_echo) continue; // skip attachments-only and our own sent messages
        const routed = await routeToCompanyForPage(pageId);
        if (!routed) continue;
        await captureSocialInboxItem(routed.companyId, {
          platform: "FACEBOOK",
          kind: "MESSAGE",
          externalId: msg.message.mid || `${msg.sender?.id}-${msg.timestamp}`,
          fromName: null,
          fromId: msg.sender?.id || null,
          text: msg.message.text,
          postOrThreadId: msg.sender?.id || null,
          permalink: null,
        });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("[Meta Webhook] Error processing lead event:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
