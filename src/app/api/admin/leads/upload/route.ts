import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import * as XLSX from "xlsx";

function cleanString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizePhone(raw: any): { digits: string; formatted: string } | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  let tenDigit = digits;
  if (digits.length === 12 && digits.startsWith("91")) {
    tenDigit = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    tenDigit = digits.slice(1);
  }

  if (tenDigit.length === 10) {
    return {
      digits: tenDigit,
      formatted: `+91 ${tenDigit.slice(0, 5)} ${tenDigit.slice(5)}`,
    };
  }
  if (digits.length >= 7 && digits.length <= 15) {
    return {
      digits,
      formatted: digits.startsWith("91") ? `+${digits}` : `+91 ${digits}`,
    };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeCompanyId = getActiveCompanyId(session);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const batchTagInput = cleanString(formData.get("batchTag"));
    const divisionInput = cleanString(formData.get("division")) || "PCD_FRANCHISE";
    const employeeId = cleanString(formData.get("employeeId")) || null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    const batchTag = batchTagInput || `${fileNameWithoutExt} (${timestamp})`;

    // Verify employee exists if assigned
    let targetEmployee: { id: string; name: string } | null = null;
    if (employeeId) {
      targetEmployee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true },
      });
      if (!targetEmployee) {
        return NextResponse.json({ error: "Target employee does not exist" }, { status: 400 });
      }
    }

    // Read buffer & parse spreadsheet with XLSX
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ error: "Uploaded spreadsheet is empty" }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { error: "No data rows found in the sheet. Please ensure headers are present." },
        { status: 400 }
      );
    }

    // Gather existing phone numbers from DB for deduplication
    const existingLeads = await prisma.lead.findMany({
      select: { phoneNumber: true },
      where: {
        phoneNumber: { not: null },
        ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
      },
    });
    const existingPhones = new Set<string>();
    for (const l of existingLeads) {
      if (l.phoneNumber) {
        const d = l.phoneNumber.replace(/\D/g, "");
        if (d) existingPhones.add(d);
        if (d.length === 12 && d.startsWith("91")) existingPhones.add(d.slice(2));
      }
    }

    const leadsToInsert: Array<{
      source: LeadSource;
      sourceTag: string;
      division: string;
      inquiryDetails: string;
      rawPayload: any;
      name: string;
      phoneNumber: string;
      city: string | null;
      state: string | null;
      status: LeadStatus;
      assignedEmployeeId: string | null;
      companyId: string | null;
    }> = [];

    const batchSeenPhones = new Set<string>();
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const row of rawRows) {
      const entries = Object.entries(row);

      let rawName = "";
      let rawPhone = "";
      let rawCity = "";
      let rawState = "";
      let rawDivision = divisionInput;
      let rawInquiry = "";

      for (const [colName, val] of entries) {
        const k = colName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const stringVal = cleanString(val);
        if (!stringVal) continue;

        if (!rawName && (k.includes("name") || k.includes("chemist") || k.includes("doctor") || k.includes("party") || k.includes("customer"))) {
          if (!k.includes("phone") && !k.includes("mobile") && !k.includes("number")) {
            rawName = stringVal;
          }
        }
        if (!rawPhone && (k.includes("phone") || k.includes("mobile") || k.includes("contact") || k.includes("whatsapp") || k.includes("tel") || k.includes("cell"))) {
          rawPhone = stringVal;
        }
        if (!rawCity && (k.includes("city") || k.includes("district") || k.includes("town") || k.includes("location"))) {
          rawCity = stringVal;
        }
        if (!rawState && (k.includes("state") || k.includes("province") || k.includes("region"))) {
          rawState = stringVal;
        }
        if (k.includes("division") || k.includes("category") || k.includes("segment") || k.includes("type")) {
          const lower = stringVal.toLowerCase();
          if (lower.includes("third") || lower.includes("mfg") || lower.includes("contract") || lower.includes("party")) {
            rawDivision = "THIRD_PARTY";
          } else if (lower.includes("pcd") || lower.includes("franchise") || lower.includes("propaganda")) {
            rawDivision = "PCD_FRANCHISE";
          }
        }
        if (k.includes("inquiry") || k.includes("enquiry") || k.includes("notes") || k.includes("requirement") || k.includes("product") || k.includes("remark")) {
          rawInquiry = stringVal;
        }
      }

      const parsedPhone = normalizePhone(rawPhone);
      if (!parsedPhone) {
        invalidCount++;
        continue;
      }

      if (existingPhones.has(parsedPhone.digits) || batchSeenPhones.has(parsedPhone.digits)) {
        duplicateCount++;
        continue;
      }

      batchSeenPhones.add(parsedPhone.digits);
      existingPhones.add(parsedPhone.digits);

      const finalName = rawName || `Prospect ${parsedPhone.digits.slice(-4)}`;
      const noteDetails = rawInquiry || `Imported via Batch: ${batchTag}${rawCity ? ` (${rawCity}, ${rawState})` : ""}`;

      leadsToInsert.push({
        source: LeadSource.EXCEL_IMPORT,
        sourceTag: batchTag,
        division: rawDivision || "PCD_FRANCHISE",
        inquiryDetails: noteDetails,
        rawPayload: {
          importedFile: file.name,
          batchTag,
          originalRow: row,
        },
        name: finalName,
        phoneNumber: parsedPhone.formatted,
        city: rawCity || null,
        state: rawState || null,
        status: targetEmployee ? LeadStatus.ASSIGNED : LeadStatus.NEW,
        assignedEmployeeId: targetEmployee ? targetEmployee.id : null,
        companyId: activeCompanyId,
      });
    }

    if (leadsToInsert.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No valid new leads could be ingested. ${duplicateCount} duplicate phone numbers and ${invalidCount} invalid rows were skipped.`,
        insertedCount: 0,
        duplicateCount,
        invalidCount,
      }, { status: 400 });
    }

    const chunkSize = 500;
    for (let i = 0; i < leadsToInsert.length; i += chunkSize) {
      const chunk = leadsToInsert.slice(i, i + chunkSize);
      await prisma.lead.createMany({
        data: chunk,
      });
    }

    if (targetEmployee) {
      const insertedLeads = await prisma.lead.findMany({
        where: {
          source: LeadSource.EXCEL_IMPORT,
          sourceTag: batchTag,
          assignedEmployeeId: targetEmployee.id,
          ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
        },
        select: { id: true },
      });

      const now = new Date();
      await prisma.leadReassignmentLog.createMany({
        data: insertedLeads.map((lead) => ({
          leadId: lead.id,
          fromEmployeeId: null,
          toEmployeeId: targetEmployee!.id,
          reason: `Auto-allotted from Excel batch "${batchTag}" upon bulk upload`,
          previousStatus: "NEW",
          newStatus: "ASSIGNED",
          reassignedAt: now,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      batchTag,
      totalRowsProcessed: rawRows.length,
      insertedCount: leadsToInsert.length,
      duplicateCount,
      invalidCount,
      division: divisionInput,
      assignedTo: targetEmployee ? targetEmployee.name : "Unassigned Allotment Pool",
    });
  } catch (error: any) {
    console.error("Bulk lead upload failed:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error during Excel processing" },
      { status: 500 }
    );
  }
}
