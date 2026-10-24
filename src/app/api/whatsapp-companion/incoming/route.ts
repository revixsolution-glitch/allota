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
    const settings = await prisma.companySettings.findMany({
      where: {
        whatsappCompanionCreds: { not: null },
        whatsappConnected: true,
      },
      select: {
        companyId: true,
        whatsappCompanionPhone: true,
        whatsappCompanionCreds: true,
      },
    });
    return NextResponse.json({ success: true, tenants: settings });
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

      await prisma.companySettings.updateMany({
        where: { companyId: body.companyId },
        data: {
          whatsappConnected: true,
          whatsappCompanionPhone: body.phone || null,
          whatsappCompanionCreds: credsData,
        },
      });
      return NextResponse.json({ success: true, backedUp: true });
    }

    const { companyId, senderPhone, senderName, messageText, isFromMe, isGroup, hasAdReferral } = body;

    // 1. Strict Security Filter: Never process outbound or group chats
    if (!companyId || !senderPhone || isFromMe || isGroup) {
      return NextResponse.json({ success: true, ignored: true, reason: "OUTBOUND_OR_GROUP" });
    }

    const cleanText = String(messageText || "").trim().toLowerCase();

    // 2. Format phone to clean +91 format
    const digits = senderPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      return NextResponse.json({ success: true, ignored: true, reason: "INVALID_PHONE" });
    }
    const formattedPhone = digits.startsWith("91") && digits.length === 12
      ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
      : `+${digits}`;

    // 3. Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // 4. Check if sender is ALREADY a tracked lead in the CRM
    const existing = await prisma.lead.findFirst({
      where: {
        companyId,
        phoneNumber: formattedPhone,
      },
      select: { id: true, name: true, inquiryDetails: true },
    });

    if (existing) {
      // It is an ongoing conversation with an existing lead
      const updatedInquiry = `${existing.inquiryDetails || ""}\n[Follow-up]: ${messageText}`.trim();
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          inquiryDetails: updatedInquiry,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        action: "UPDATED",
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

    const newLead = await prisma.lead.create({
      data: {
        companyId,
        name: senderName || "WhatsApp Prospect",
        phoneNumber: formattedPhone,
        source: LeadSource.WHATSAPP,
        sourceTag: hasAdReferral ? "Meta Click-to-WhatsApp Ad" : "WhatsApp Ad Inquirer",
        division: "PCD_FRANCHISE",
        status: defaultEmployee ? LeadStatus.ASSIGNED : LeadStatus.NEW,
        assignedEmployeeId: defaultEmployee?.id || null,
        inquiryDetails: messageText || "Initiated ad inquiry on WhatsApp.",
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
