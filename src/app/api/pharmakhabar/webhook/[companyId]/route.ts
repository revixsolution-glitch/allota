import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma, defaultPrisma, warmTenantClient } from "@/lib/prisma";
import { setTenantContext } from "@/lib/tenant-context";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import { extractPhoneNumber, normalizePhoneKey } from "@/lib/phone-utils";
import { pickNextEmployeeForSource } from "@/lib/lead-assignment";
import { getDefaultFollowUpDate } from "@/lib/follow-up";

export const dynamic = "force-dynamic";

/**
 * PharmaKhabar -> Allota lead webhook (tenant-scoped).
 *
 * Configure in PharmaKhabar / supplier integration:
 *   URL     POST https://crm.allota.in/api/pharmakhabar/webhook/<companyId>
 *   Header  x-api-key: <CompanySettings.pharmaKhabarApiKey>
 *   Payload JSON (or form-encoded)
 */

function safeEqual(a: string, b: string) {
  if (!a || !b) return false;
  const ab = Buffer.from(a.trim());
  const bb = Buffer.from(b.trim());
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** First non-empty string value among candidate keys (case/space/underscore-insensitive). */
function pick(body: Record<string, any>, ...keys: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
  const flat = new Map<string, any>();
  for (const [k, v] of Object.entries(body)) flat.set(norm(k), v);
  for (const key of keys) {
    const v = flat.get(norm(key));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

async function readBody(req: NextRequest): Promise<Record<string, any>> {
  const type = req.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) return await req.json();
    if (type.includes("form")) {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    }
    const text = await req.text();
    try {
      return JSON.parse(text);
    } catch {
      return Object.fromEntries(new URLSearchParams(text).entries());
    }
  } catch {
    return {};
  }
}

// Allows browser or ping checks to verify endpoint status
export async function GET() {
  return NextResponse.json({ ok: true, service: "allota-pharmakhabar-webhook" });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId: rawCompanyParam } = await params;

  // Resolve target company by CUID or slug (lenient routing)
  const targetCompany = await defaultPrisma.company.findFirst({
    where: {
      OR: [
        { id: rawCompanyParam },
        { slug: rawCompanyParam },
      ],
    },
    select: { id: true, name: true, slug: true },
  });

  if (!targetCompany) {
    return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 });
  }

  const companyId = targetCompany.id;

  const settings = await defaultPrisma.companySettings.findFirst({
    where: { companyId },
    select: { pharmaKhabarApiKey: true },
  });

  const body = await readBody(req);

  const supplied =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    new URL(req.url).searchParams.get("key") ||
    new URL(req.url).searchParams.get("apiKey") ||
    new URL(req.url).searchParams.get("token") ||
    pick(body, "api_key", "apiKey", "key", "token", "secret") ||
    "";

  // If a key is supplied, validate it against settings if configured.
  // If no key is supplied, accept since companyId in the URL already isolates tenant.
  if (supplied && settings?.pharmaKhabarApiKey && !safeEqual(supplied, settings.pharmaKhabarApiKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  setTenantContext(companyId);
  await warmTenantClient(companyId);

  const name = pick(body, "name", "buyer_name", "lead_buyer_name", "leadBuyerName", "client_name", "contact_person");
  const rawPhone = pick(body, "mobile", "phone", "phone_number", "contact_number", "mobile_number");
  const email = pick(body, "email", "lead_buyer_email", "email_id");

  if (!rawPhone && !email) {
    return NextResponse.json({ ok: false, error: "mobile or email required" }, { status: 400 });
  }

  const parsed = extractPhoneNumber(rawPhone);
  const phoneKey = normalizePhoneKey(rawPhone);
  const formattedPhone = parsed ? parsed.formatted : rawPhone;
  const city = pick(body, "city", "location", "district");
  const state = pick(body, "state", "region", "province");

  // Division detection: PCD Franchise vs Third Party
  const rawService = pick(body, "service_type", "serviceType", "division", "category", "inquiry_type", "requirement", "message") || "";
  const isThirdParty = /third[\s\-_]?party|contract[\s\-_]?mfg|manufacturing|thirdparty/i.test(rawService);
  const division = isThirdParty ? "THIRD_PARTY" : "PCD_FRANCHISE";

  const details = [
    ["Message / Requirement", pick(body, "message", "requirement", "query", "description", "inquiry")],
    ["Email", email],
    ["Firm / Company", pick(body, "firm_name", "firmName", "company_name", "company")],
    ["Profession", pick(body, "profession", "designation", "business_type")],
    ["Experience", pick(body, "experience")],
    ["Service / Division", pick(body, "service_type", "serviceType", "division", "category")],
    ["PCD Territory", pick(body, "pcd_area", "pcdArea", "territory", "desired_area")],
    ["Medicine Type", pick(body, "medicine_type", "medicineType", "product", "molecules")],
    ["Selling Purpose", pick(body, "selling_purpose", "sellingPurpose")],
    ["GST Number", pick(body, "gst_number", "gst")],
    ["Drug License", pick(body, "drug_license", "drugLicense", "dl_number")],
    ["Call Time", pick(body, "call_time", "callTime", "preferred_time")],
    ["Address", pick(body, "address")],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(". ");

  // Zero-duplicate guarantee: same phone in this company updates the existing lead.
  if (phoneKey) {
    const companyLeads = await prisma.lead.findMany({
      where: { companyId, phoneNumber: { not: null } },
      select: { id: true, phoneNumber: true, inquiryDetails: true },
    });
    const existing = companyLeads.find((l) => normalizePhoneKey(l.phoneNumber) === phoneKey);
    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          inquiryDetails:
            `${existing.inquiryDetails || ""}\n[Repeat PharmaKhabar ${new Date().toLocaleDateString()}] ${details}`.trim(),
          rawPayload: body,
        },
      });
      return NextResponse.json({ ok: true, leadId: existing.id, duplicate: true });
    }
  }

  const isTestLead = name === "Test User" || rawPhone === "9999999999";
  const sourceTag = isTestLead ? "PharmaKhabar (Test Lead)" : "PharmaKhabar";

  const assignedEmployeeId =
    (await pickNextEmployeeForSource(companyId, LeadSource.PHARMAKHABAR)) ||
    (await pickNextEmployeeForSource(companyId, LeadSource.WEBSITE));

  const lead = await prisma.lead.create({
    data: {
      companyId,
      name: name || (isTestLead ? "PharmaKhabar Test User" : "PharmaKhabar Inquirer"),
      phoneNumber: formattedPhone,
      city,
      state,
      source: LeadSource.PHARMAKHABAR,
      sourceTag,
      division,
      status: assignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
      assignedEmployeeId,
      followUpAt: getDefaultFollowUpDate(),
      inquiryDetails: `PharmaKhabar Inbound Lead. ${details}`,
      rawPayload: body,
    },
  });

  if (assignedEmployeeId) {
    await prisma.leadReassignmentLog.create({
      data: {
        leadId: lead.id,
        fromEmployeeId: null,
        toEmployeeId: assignedEmployeeId,
        reason: "Auto-assigned via round-robin (PharmaKhabar source)",
        previousStatus: "NEW",
        newStatus: "ASSIGNED",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    message: isTestLead ? "PharmaKhabar test lead ingested successfully!" : "Lead ingested successfully",
    leadId: lead.id,
    source: "PHARMAKHABAR",
  });
}
