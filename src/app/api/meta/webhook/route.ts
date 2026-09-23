import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
 * Meta Real-Time Lead Event Receiver (POST)
 * Triggered automatically by Meta when a prospect submits a Facebook or Instagram Lead Ad.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || body.object !== "page") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    // Process each leadgen event
    for (const entry of body.entry || []) {
      const pageId = entry.id;

      for (const change of entry.changes || []) {
        if (change.field === "leadgen") {
          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;

          if (!leadgenId) continue;

          // 1. Look up company settings by pageId or fallback to active settings
          const settings = await prisma.companySettings.findFirst({
            where: {
              OR: [
                { metaPageId: pageId },
                { metaAccessToken: { not: null } },
                { metaApiKey: { not: null } },
              ],
            },
            include: { company: true },
          });

          const accessToken =
            settings?.metaAccessToken ||
            settings?.metaApiKey ||
            process.env.META_ACCESS_TOKEN;

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
                ...(settings?.companyId ? { companyId: settings.companyId } : {}),
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
            settings?.companyId || null,
            LeadSource.META
          );

          // 4. Ingest new verified lead into CRM Lead Center
          const newLead = await prisma.lead.create({
            data: {
              companyId: settings?.companyId || null,
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
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("[Meta Webhook] Error processing lead event:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
