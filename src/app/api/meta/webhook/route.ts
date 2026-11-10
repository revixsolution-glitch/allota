import { NextRequest, NextResponse } from "next/server";
import { prisma, defaultPrisma, warmTenantClient } from "@/lib/prisma";
import { setTenantContext } from "@/lib/tenant-context";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { extractPhoneNumber, normalizePhoneKey } from "@/lib/phone-utils";
import { pickNextEmployeeForSource } from "@/lib/lead-assignment";
import { getDefaultFollowUpDate } from "@/lib/follow-up";
import { formatLeadName } from "@/lib/lead-format";

export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || process.env.VERIFY_TOKEN || "allota_meta_verify_token";
const COMPANION_SERVICE_URL =
  process.env.COMPANION_SERVICE_URL ||
  "http://127.0.0.1:10000";

/**
 * Meta Webhook Verification (GET)
 * Used by Meta Developers to verify the webhook URL.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && (token === VERIFY_TOKEN || token === "allota_meta_verify_token")) {
    console.log("[Meta Webhook] Verification successful!");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * Dispatches an instant WhatsApp alert to Savi (+91 78891 07964) for Kesrox leads
 * via the live Render Companion endpoint with 1-tap call and WhatsApp links.
 */
async function dispatchLeadToSavi(params: {
  companyId: string;
  senderName: string;
  formattedPhone: string;
  clean10: string;
  inquiry: string;
  headline?: string | null;
  division?: string;
  isUpdate?: boolean;
}) {
  const isKesrox =
    params.companyId === "cmubi8zf6000004l8y45hhuds" ||
    params.companyId === "cmub4ssdx00000u8oqlqc62e0";

  if (!isKesrox) return;

  const endpoint = `${COMPANION_SERVICE_URL}/api/${params.companyId}/forward-lead`;
  const fallbackEndpoint = `${COMPANION_SERVICE_URL}/api/${params.companyId}/update-lead-phone`;

  const payload = {
    name: params.senderName,
    phone: params.formattedPhone,
    clean10: params.clean10,
    headline: params.headline || "Third-Party Pharma Manufacturing",
    inquiry: params.inquiry,
    division: params.division || "THIRD_PARTY",
    isUpdate: Boolean(params.isUpdate),
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      await fetch(fallbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
    }
    console.log(`[Meta Webhook] Successfully dispatched WhatsApp lead to Savi: ${params.senderName} (${params.formattedPhone})`);
  } catch (err: any) {
    console.warn(`[Meta Webhook] Forward-lead dispatch error (${err?.message}), attempting fallback...`);
    try {
      await fetch(fallbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      console.log(`[Meta Webhook] Dispatched WhatsApp lead to Savi via fallback: ${params.senderName} (${params.formattedPhone})`);
    } catch (fbErr: any) {
      console.warn(`[Meta Webhook] All dispatch attempts to Savi failed:`, fbErr?.message);
    }
  }
}

/**
 * Finds which company owns a Meta Page id, WABA id, or Phone Number ID, and points every `prisma.*` call
 * for the rest of this event at that company's own database (via the TenantDatabase routing table).
 */
async function routeToCompanyForPage(
  pageId: string
): Promise<{ companyId: string; accessToken: string | null } | null> {
  if (!pageId) return null;

  // Known Meta IDs specifically provisioned for Kesrox Healthcare
  const isKesroxSpecificId =
    pageId === "1460433551636446" || // Kesrox WABA ID
    pageId === "739027919285346" ||  // Kesrox Phone Number ID
    pageId === "112876304657266";     // Kesrox Page ID

  // 1. Check TenantDatabase routing table by Page id OR WhatsApp Business Account id
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

  // 2. Check CompanySettings by Page id, WABA id, or Phone Number id
  const settings = await defaultPrisma.companySettings.findFirst({
    where: { OR: [{ metaPageId: pageId }, { metaWabaId: pageId }, { metaPhoneNumberId: pageId }] },
    select: { companyId: true, metaAccessToken: true, metaApiKey: true },
  });
  if (settings?.companyId) {
    setTenantContext(settings.companyId);
    await warmTenantClient(settings.companyId);
    return { companyId: settings.companyId, accessToken: settings.metaAccessToken || settings.metaApiKey || null };
  }

  // 3. Fallback resolution for Kesrox Primary Account (cmubi8zf6000004l8y45hhuds)
  // Ensures incoming Meta WhatsApp webhooks seamlessly map to Kesrox even if the IDs were newly created in Meta Developer Portal
  const kesroxSettings = await defaultPrisma.companySettings.findFirst({
    where: {
      OR: [
        { companyId: "cmubi8zf6000004l8y45hhuds" },
        { companyId: "cmub4ssdx00000u8oqlqc62e0" },
      ],
    },
    select: { companyId: true, metaAccessToken: true, metaApiKey: true, metaWabaId: true, metaPhoneNumberId: true },
  });

  if (kesroxSettings?.companyId && (isKesroxSpecificId || !kesroxSettings.metaWabaId || !kesroxSettings.metaPhoneNumberId)) {
    // Auto-populate the incoming Meta ID onto Kesrox's settings if not yet saved
    if (!kesroxSettings.metaWabaId) {
      await defaultPrisma.companySettings.updateMany({
        where: { companyId: kesroxSettings.companyId },
        data: { metaWabaId: pageId },
      }).catch(() => null);
    }
    setTenantContext(kesroxSettings.companyId);
    await warmTenantClient(kesroxSettings.companyId);
    return {
      companyId: kesroxSettings.companyId,
      accessToken: kesroxSettings.metaAccessToken || kesroxSettings.metaApiKey || null,
    };
  }

  return null;
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

            // Auto-persist phoneId to Kesrox CompanySettings if not yet set
            if (phoneId) {
              await defaultPrisma.companySettings.updateMany({
                where: { companyId: routed.companyId, metaPhoneNumberId: null },
                data: { metaPhoneNumberId: phoneId },
              }).catch(() => null);
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

              // Meta WhatsApp Cloud API passes the unmasked callable 10-digit phone number in `msg.from` and `contacts[0].wa_id`
              const senderFrom = msg.from || contacts[0]?.wa_id || "";
              const cleanDigits = String(senderFrom).replace(/\D/g, "");
              const clean10 = cleanDigits.startsWith("91") && cleanDigits.length === 12
                ? cleanDigits.slice(2)
                : cleanDigits.slice(-10);

              const rawPhone = cleanDigits ? `+${cleanDigits}` : null;
              const formattedPhone = clean10.length === 10
                ? `+91 ${clean10.slice(0, 5)} ${clean10.slice(5)}`
                : (rawPhone || "WhatsApp Prospect");
              const phoneKey = normalizePhoneKey(rawPhone);

              const senderName = contactMap.get(msg.from) || contacts[0]?.profile?.name || "WhatsApp Prospect";
              const messageText = msg.text?.body || `[${msg.type || "Inquiry"} received on WhatsApp]`;

              // Check if message originated from a Click-to-WhatsApp Ad
              const referral = msg.referral;
              const isAd = Boolean(referral);
              const sourceTag = isAd
                ? `Meta WhatsApp Ad (${referral.headline || referral.source_id || "Direct"})`
                : "Direct WhatsApp Message";

              const combinedContext = `${referral?.headline || ""} ${referral?.body || ""} ${messageText}`.toLowerCase();
              const isPcdExplicit = combinedContext.includes("pcd") || combinedContext.includes("franchise") || combinedContext.includes("monopoly");
              const isThirdPartyExplicit = combinedContext.includes("third party") || combinedContext.includes("3rd party") || combinedContext.includes("manufacturing") || combinedContext.includes("monthly qty") || combinedContext.includes("batch");
              const isKesrox = routed.companyId === "cmubi8zf6000004l8y45hhuds" || routed.companyId === "cmub4ssdx00000u8oqlqc62e0";
              const determinedDivision = (isKesrox && !isPcdExplicit) || isThirdPartyExplicit ? "THIRD_PARTY" : (isPcdExplicit ? "PCD_FRANCHISE" : "THIRD_PARTY");

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

                // Immediate automated dispatch to Savi on WhatsApp (+91 78891 07964)
                await dispatchLeadToSavi({
                  companyId: routed.companyId,
                  senderName,
                  formattedPhone,
                  clean10,
                  inquiry: messageText,
                  headline: referral?.headline,
                  division: determinedDivision,
                  isUpdate: true,
                });

                continue;
              }

              // Round-robin assign to sales representatives
              const autoAssignedEmployeeId =
                (await pickNextEmployeeForSource(routed.companyId, LeadSource.WHATSAPP)) ||
                (await pickNextEmployeeForSource(routed.companyId, LeadSource.META));

              const inquiryDetails = isAd
                ? `Inquiry via Click-to-WhatsApp Ad (${determinedDivision === "THIRD_PARTY" ? "Third-Party Manufacturing" : "PCD Franchise"}).\nAd Headline: ${referral.headline || "N/A"}\nMessage: "${messageText}"`
                : `WhatsApp Direct Inquiry:\n"${messageText}"`;

              const newLead = await prisma.lead.create({
                data: {
                  companyId: routed.companyId,
                  name: senderName,
                  phoneNumber: formattedPhone,
                  source: LeadSource.WHATSAPP,
                  sourceTag: isAd ? `Meta WhatsApp Ad (${determinedDivision === "THIRD_PARTY" ? "Third-Party Mfg" : "PCD Franchise"})` : sourceTag,
                  division: determinedDivision,
                  status: autoAssignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
                  assignedEmployeeId: autoAssignedEmployeeId,
                  followUpAt: getDefaultFollowUpDate(),
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

              // Immediate automated dispatch to Savi on WhatsApp (+91 78891 07964)
              await dispatchLeadToSavi({
                companyId: routed.companyId,
                senderName,
                formattedPhone,
                clean10,
                inquiry: messageText,
                headline: referral?.headline,
                division: determinedDivision,
                isUpdate: false,
              });
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
          let activeToken = accessToken;
          let metaRes = await fetch(
            `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${activeToken}`
          );

          // If the token is a User token, automatically exchange it for the Page Access Token
          if (!metaRes.ok) {
            try {
              const accRes = await fetch(
                `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
              );
              if (accRes.ok) {
                const accData = await accRes.json();
                const pageMatch = (accData.data || []).find((a: any) => a.id === pageId);
                if (pageMatch?.access_token) {
                  activeToken = pageMatch.access_token;
                  metaRes = await fetch(
                    `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${activeToken}`
                  );
                }
              }
            } catch (exchangeErr: any) {
              console.warn("[Meta Webhook] Token exchange warning:", exchangeErr?.message);
            }
          }

          if (!metaRes.ok) {
            console.error(`[Meta Webhook] Failed to fetch lead ${leadgenId} from Graph API:`, await metaRes.text());
            continue;
          }

          const leadData = await metaRes.json();
          const fieldData: Record<string, string> = {};

          for (const item of leadData.field_data || []) {
            fieldData[item.name] = Array.isArray(item.values) ? item.values[0] : String(item.values);
          }

          const rawFullName =
            fieldData["full_name"] ||
            fieldData["name"] ||
            `${fieldData["first_name"] || ""} ${fieldData["last_name"] || ""}`.trim() ||
            "Meta Ad Prospect";
          const fullName = formatLeadName(rawFullName) || "Meta Ad Prospect";

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

            const leadCleanDigits = String(formattedPhone || "").replace(/\D/g, "");
            const leadClean10 = leadCleanDigits.startsWith("91") && leadCleanDigits.length === 12
              ? leadCleanDigits.slice(2)
              : leadCleanDigits.slice(-10);

            await dispatchLeadToSavi({
              companyId: routed.companyId,
              senderName: fullName,
              formattedPhone: formattedPhone || "N/A",
              clean10: leadClean10,
              inquiry: `Repeat Form Submission (Form: ${formId || "Direct"}). Email: ${email || "N/A"}`,
              headline: `Meta Lead Form (${formId || "Instant Form"})`,
              division: "THIRD_PARTY",
              isUpdate: true,
            });

            continue;
          }

          // 3. Round-robin the lead to whichever employees the admin dedicated to Meta
          const autoAssignedEmployeeId = await pickNextEmployeeForSource(
            routed.companyId,
            LeadSource.META
          );

          // 4. Ingest new verified lead into CRM Lead Center
          const leadContext = `${JSON.stringify(fieldData)} ${formId || ""}`.toLowerCase();
          const isPcdExplicit = leadContext.includes("pcd") || leadContext.includes("franchise") || leadContext.includes("monopoly");
          const isThirdPartyExplicit = leadContext.includes("third party") || leadContext.includes("3rd party") || leadContext.includes("manufacturing") || leadContext.includes("monthly qty") || leadContext.includes("batch");
          const isKesrox = routed.companyId === "cmubi8zf6000004l8y45hhuds" || routed.companyId === "cmub4ssdx00000u8oqlqc62e0";
          const determinedDivision = (isKesrox && !isPcdExplicit) || isThirdPartyExplicit ? "THIRD_PARTY" : (isPcdExplicit ? "PCD_FRANCHISE" : "THIRD_PARTY");

          const newLead = await prisma.lead.create({
            data: {
              companyId: routed.companyId,
              name: fullName,
              phoneNumber: formattedPhone,
              city,
              state,
              source: LeadSource.META,
              sourceTag: `Meta Lead Ad (${determinedDivision === "THIRD_PARTY" ? "Third-Party Mfg" : "PCD Franchise"}) (Form: ${formId || "Direct"})`,
              division: determinedDivision,
              status: autoAssignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
              assignedEmployeeId: autoAssignedEmployeeId,
              followUpAt: getDefaultFollowUpDate(),
              inquiryDetails: `Meta Leadgen Form (${determinedDivision === "THIRD_PARTY" ? "Third-Party Manufacturing" : "PCD Franchise"}). Email: ${email || "N/A"}. Meta Lead ID: ${leadgenId}`,
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

          const leadCleanDigits = String(formattedPhone || "").replace(/\D/g, "");
          const leadClean10 = leadCleanDigits.startsWith("91") && leadCleanDigits.length === 12
            ? leadCleanDigits.slice(2)
            : leadCleanDigits.slice(-10);

          await dispatchLeadToSavi({
            companyId: routed.companyId,
            senderName: fullName,
            formattedPhone: formattedPhone || "N/A",
            clean10: leadClean10,
            inquiry: `Lead Form Submission. City: ${city || "N/A"}, State: ${state || "N/A"}, Email: ${email || "N/A"}`,
            headline: `Meta Lead Form (${formId || "Instant Form"})`,
            division: determinedDivision,
            isUpdate: false,
          });
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
