import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";

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

          const phoneNumber =
            fieldData["phone_number"] ||
            fieldData["phone"] ||
            fieldData["contact_number"] ||
            null;

          const city = fieldData["city"] || fieldData["location"] || null;
          const state = fieldData["state"] || null;
          const email = fieldData["email"] || null;

          // 3. Find default representative to allot the lead to
          const defaultRep = await prisma.employee.findFirst({
            where: settings?.companyId ? { companyId: settings.companyId } : {},
            orderBy: { createdAt: "desc" },
          });

          // 4. Ingest lead into CRM Lead Center
          await prisma.lead.create({
            data: {
              companyId: settings?.companyId || null,
              name: fullName,
              phoneNumber,
              city,
              state,
              source: LeadSource.META,
              sourceTag: `Meta Lead Ad (Form: ${formId || "Direct"})`,
              division: "PCD_FRANCHISE",
              status: LeadStatus.NEW,
              assignedEmployeeId: defaultRep?.id || null,
              inquiryDetails: `Facebook / Instagram PCD Inquiry. Email: ${email || "N/A"}. Meta Lead ID: ${leadgenId}`,
              rawPayload: leadData,
            },
          });

          console.log(`[Meta Webhook] Successfully ingested lead: ${fullName} (${phoneNumber})`);
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("[Meta Webhook] Error processing lead event:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
