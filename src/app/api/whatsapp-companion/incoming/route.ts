import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/**
 * Ingestion endpoint for WhatsApp companion messages.
 * Automatically converts incoming WhatsApp ad inquiries into CRM Leads.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { companyId, senderPhone, senderName, messageText, isFromMe } = body;

    if (!companyId || !senderPhone || isFromMe) {
      return NextResponse.json({ success: true, ignored: true });
    }

    // Format phone to clean +91 format
    const digits = senderPhone.replace(/\D/g, "");
    const formattedPhone = digits.startsWith("91") && digits.length === 12
      ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
      : `+${digits}`;

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: {
        companyId,
        phoneNumber: formattedPhone,
      },
      select: { id: true, name: true, inquiryDetails: true },
    });

    if (existing) {
      // Append inquiry update
      const updatedInquiry = `${existing.inquiryDetails || ""}\n[New Message]: ${messageText}`.trim();
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

    // Pick first active employee to auto-assign
    const defaultEmployee = await prisma.employee.findFirst({
      where: { companyId },
      select: { id: true, name: true },
    });

    const isAdMessage =
      messageText?.toLowerCase().includes("pcd") ||
      messageText?.toLowerCase().includes("franchise") ||
      messageText?.toLowerCase().includes("product list") ||
      messageText?.toLowerCase().includes("pricing") ||
      messageText?.toLowerCase().includes("monopoly");

    const newLead = await prisma.lead.create({
      data: {
        companyId,
        name: senderName || "WhatsApp Inquirer",
        phoneNumber: formattedPhone,
        source: LeadSource.WHATSAPP,
        sourceTag: isAdMessage ? "WhatsApp Meta Ad Inquiry" : "WhatsApp Direct Message",
        division: "PCD_FRANCHISE",
        status: defaultEmployee ? LeadStatus.ASSIGNED : LeadStatus.NEW,
        assignedEmployeeId: defaultEmployee?.id || null,
        inquiryDetails: messageText || "Customer initiated WhatsApp conversation.",
      },
    });

    console.log(`[WhatsApp Companion] New Lead Created: ${newLead.name} (${newLead.phoneNumber}) for ${company.name}`);

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
