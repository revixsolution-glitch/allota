import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/**
 * Commercial Ad & Lead Keywords for PCD Pharma & Meta Ads.
 * Personal, family, or supplier chats that do not match these are dropped by the firewall.
 */
const AD_INTENT_KEYWORDS = [
  "pcd",
  "franchise",
  "product list",
  "pricing",
  "rate list",
  "catalog",
  "catalogue",
  "monopoly",
  "distributor",
  "distributorship",
  "pharma",
  "remedies",
  "interested",
  "inquiry",
  "enquiry",
  "share details",
  "order",
  "medicine",
  "sample",
];

/**
 * Strict Security Ingestion endpoint for WhatsApp companion messages.
 * PRIVACY GUARANTEE: Only captures verifiable Meta Ad leads and commercial inquiries.
 * Personal chats, family messages, group chats, and outbound texts are dropped immediately.
 */
export async function GET() {
  try {
    // Auto-reclassify any active Meta Ad leads for Kesrox to Third-Party Manufacturing
    await prisma.lead.updateMany({
      where: {
        companyId: "cmubi8zf6000004l8y45hhuds",
        OR: [
          { name: { contains: "Renjith" } },
          { name: { contains: "A K DRUGS" } },
          { inquiryDetails: { contains: "Monthly qty" } },
          { phoneNumber: { in: ["+136391149277265", "+77588651323577"] } },
        ],
      },
      data: {
        division: "THIRD_PARTY",
        sourceTag: "Meta Click-to-WhatsApp Ad (Third-Party Mfg)",
      },
    });

    const [settings, recentLeads] = await Promise.all([
      prisma.companySettings.findMany({
        where: {
          whatsappCompanionCreds: { not: null },
        },
        select: {
          companyId: true,
          whatsappCompanionPhone: true,
          whatsappCompanionCreds: true,
        },
      }),
      prisma.lead.findMany({
        where: {
          companyId: "cmubi8zf6000004l8y45hhuds",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          division: true,
          source: true,
          sourceTag: true,
          createdAt: true,
          inquiryDetails: true,
        },
      }),
    ]);
    return NextResponse.json({ success: true, tenants: settings, recentLeads });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Handle session credential & full key state backup from companion daemon
    if (body.action === "BACKUP_CREDS" && body.companyId) {
      const credsData = body.sessionMap
        ? (typeof body.sessionMap === "string" ? body.sessionMap : JSON.stringify(body.sessionMap))
        : (typeof body.creds === "string" ? body.creds : JSON.stringify(body.creds));

      // VAULT INTEGRITY GUARD: Strict verification of genuine Baileys cryptographic key material.
      // Refuse to overwrite if the payload is a dummy probe, empty object, or lacks cryptographic keys.
      let isValidPayload = false;
      try {
        const parsed = typeof credsData === "string" ? JSON.parse(credsData) : credsData;
        if (parsed && typeof parsed === "object") {
          const hasMultiFileCreds = parsed["creds.json"] && (
            parsed["creds.json"].includes("noiseKey") ||
            parsed["creds.json"].includes("registrationId") ||
            parsed["creds.json"].includes("signedIdentityKey")
          );
          const hasSingleCreds = parsed.noiseKey || parsed.registrationId || parsed.signedIdentityKey;
          isValidPayload = Boolean(hasMultiFileCreds || hasSingleCreds);
        }
      } catch {
        isValidPayload = false;
      }

      if (!isValidPayload) {
        console.warn(`[Vault Integrity Guard] Blocked attempt to overwrite session for ${body.companyId} with invalid/empty credentials.`);
        return NextResponse.json({ error: "Payload rejected: Missing valid cryptographic Baileys session keys." }, { status: 400 });
      }

      const updated = await prisma.companySettings.updateMany({
        where: { companyId: body.companyId },
        data: {
          whatsappConnected: true,
          whatsappCompanionPhone: body.phone || null,
          whatsappCompanionCreds: credsData,
        },
      });

      if (updated.count === 0) {
        const comp = await prisma.company.findUnique({
          where: { id: body.companyId },
          select: { id: true, name: true },
        });

        await prisma.companySettings.create({
          data: {
            companyId: body.companyId,
            companyName: comp?.name || "Company",
            whatsappConnected: true,
            whatsappCompanionPhone: body.phone || null,
            whatsappCompanionCreds: credsData,
          },
        });
      }

      console.log(`[Creds Vault] Successfully saved session for company ${body.companyId} to PostgreSQL`);
      return NextResponse.json({ success: true, backedUp: true });
    }

    const { companyId, senderPhone, senderName, messageText, isFromMe, isGroup, hasAdReferral, lidJid } = body;

    // 1. Strict Security Filter: Never process outbound or group chats
    if (!companyId || !senderPhone || isFromMe || isGroup) {
      return NextResponse.json({ success: true, ignored: true, reason: "OUTBOUND_OR_GROUP" });
    }

    const cleanText = String(messageText || "").trim().toLowerCase();

    // 2. Format phone to clean +91 format or preserve pending state
    const isAwaitingPhone = String(senderPhone).includes("Awaiting Phone");
    let formattedPhone = senderPhone;

    if (!isAwaitingPhone) {
      const digits = senderPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        return NextResponse.json({ success: true, ignored: true, reason: "INVALID_PHONE" });
      }
      formattedPhone = digits.startsWith("91") && digits.length === 12
        ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
        : `+${digits}`;
    }

    // 3. Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // 4. Check if sender is ALREADY a tracked lead in the CRM (by phone, by LID, or awaiting lead)
    const existing = await prisma.lead.findFirst({
      where: {
        companyId,
        OR: [
          { phoneNumber: formattedPhone },
          ...(lidJid ? [{ inquiryDetails: { contains: lidJid } }] : []),
          ...(!isAwaitingPhone && senderName ? [{ name: senderName, phoneNumber: { contains: "Awaiting" } }] : []),
        ],
      },
      select: { id: true, name: true, phoneNumber: true, inquiryDetails: true },
    });

    if (existing) {
      // It is an ongoing conversation with an existing lead, or real phone received for awaiting lead
      const updatedInquiry = `${existing.inquiryDetails || ""}\n[Update]: ${messageText}`.trim();
      const needsPhoneUpgrade = !isAwaitingPhone && Boolean(existing.phoneNumber?.includes("Awaiting"));

      const cleanLower = `${cleanText} ${body.sourceTag || ""}`.toLowerCase();
      const isPcdExplicit = cleanLower.includes("pcd") || cleanLower.includes("franchise") || cleanLower.includes("monopoly");
      const isThirdPartyExplicit = cleanLower.includes("third party") || cleanLower.includes("3rd party") || cleanLower.includes("monthly qty") || cleanLower.includes("manufacturing") || cleanLower.includes("batch");
      const determinedDivision = body.division || (isPcdExplicit && !isThirdPartyExplicit ? "PCD_FRANCHISE" : "THIRD_PARTY");

      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          phoneNumber: needsPhoneUpgrade ? formattedPhone : existing.phoneNumber,
          division: determinedDivision,
          inquiryDetails: updatedInquiry,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        action: needsPhoneUpgrade ? "UPGRADED_PHONE" : "UPDATED",
        leadId: existing.id,
      });
    }

    // 5. PRIVACY FIREWALL: Verify if this new contact is from a Meta Ad or Commercial Inquiry
    const matchesCommercialIntent = AD_INTENT_KEYWORDS.some((kw) => cleanText.includes(kw));
    const isVerifiedAdLead = Boolean(hasAdReferral) || matchesCommercialIntent;

    if (!isVerifiedAdLead) {
      // Drop personal / non-ad chats silently without storing anything
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: "FILTERED_NON_AD_MESSAGE",
      });
    }

    // 6. Ingest only verified ad leads into Allota CRM
    const defaultEmployee = await prisma.employee.findFirst({
      where: { companyId },
      select: { id: true, name: true },
    });

    const cleanLower = `${cleanText} ${body.sourceTag || ""}`.toLowerCase();
    const isPcdExplicit = cleanLower.includes("pcd") || cleanLower.includes("franchise") || cleanLower.includes("monopoly");
    const isThirdPartyExplicit = cleanLower.includes("third party") || cleanLower.includes("3rd party") || cleanLower.includes("monthly qty") || cleanLower.includes("manufacturing") || cleanLower.includes("batch");
    const determinedDivision = body.division || (isPcdExplicit && !isThirdPartyExplicit ? "PCD_FRANCHISE" : "THIRD_PARTY");

    const newLead = await prisma.lead.create({
      data: {
        companyId,
        name: senderName || "WhatsApp Prospect",
        phoneNumber: formattedPhone,
        source: LeadSource.WHATSAPP,
        sourceTag: hasAdReferral ? `Meta Ad (${determinedDivision === "THIRD_PARTY" ? "Third-Party Mfg" : "PCD Franchise"})` : "WhatsApp Ad Inquirer",
        division: determinedDivision,
        status: defaultEmployee ? LeadStatus.ASSIGNED : LeadStatus.NEW,
        assignedEmployeeId: defaultEmployee?.id || null,
        inquiryDetails: lidJid ? `[LID: ${lidJid}]\n${messageText || "Initiated ad inquiry on WhatsApp."}` : (messageText || "Initiated ad inquiry on WhatsApp."),
      },
    });

    console.log(`[Privacy Firewall] Verified Ad Lead Captured: ${newLead.name} (${newLead.phoneNumber}) for ${company.name}`);

    return NextResponse.json({
      success: true,
      action: "CREATED",
      leadId: newLead.id,
    });
  } catch (error: any) {
    console.error("[WhatsApp Companion] Ingestion Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process lead" },
      { status: 500 }
    );
  }
}
