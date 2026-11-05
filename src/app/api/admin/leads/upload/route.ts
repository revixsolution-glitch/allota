import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import * as XLSX from "xlsx";

import { normalizePhoneKey } from "@/lib/phone-utils";
import { analyzeSheet, extractLead, pickLeadSheet, LEAD_FIELDS, type ColumnMapping } from "@/lib/lead-sheet";
import { getDefaultFollowUpDate } from "@/lib/follow-up";
import { formatLeadName } from "@/lib/lead-format";

function cleanString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
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
    if (!workbook.SheetNames.length) {
      return NextResponse.json({ error: "Uploaded spreadsheet contains no sheets" }, { status: 400 });
    }

    // Pick whichever sheet actually has the leads — matches exactly what the
    // browser preview showed, so what you saw is what gets imported.
    const picked = pickLeadSheet(workbook);
    const aoa = picked.aoa;
    const nonEmptyRows = aoa.filter((row) => Array.isArray(row) && row.some((cell) => cleanString(cell) !== ""));

    if (nonEmptyRows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded spreadsheet contains no data rows." },
        { status: 400 }
      );
    }

    // Same parser the upload preview uses, so the preview always matches the import.
    const analysis = analyzeSheet(aoa);
    const dataRows = analysis.rows;
    const headerRow = analysis.columnLabels;

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "Spreadsheet contains a header row but no lead data rows below it." },
        { status: 400 }
      );
    }

    // Optional user override from the preview: { name: 1, phone: 2, city: null, ... } (column indexes)
    const mapping: ColumnMapping = { ...analysis.mapping };
    const columnMappingRaw = formData.get("columnMapping") as string | null;
    if (columnMappingRaw) {
      try {
        const override = JSON.parse(columnMappingRaw) as Record<string, unknown>;
        for (const field of LEAD_FIELDS) {
          const v = override[field];
          if (v === null || (typeof v === "number" && v >= 0 && v < analysis.columnCount)) {
            mapping[field] = v as number | null;
          }
        }
      } catch {
        // ignore malformed override and keep auto-detected mapping
      }
    }

    // Gather existing phone numbers from DB for deduplication (Both Leads and converted Clients)
    const [existingLeads, existingClients] = await Promise.all([
      prisma.lead.findMany({
        select: { phoneNumber: true },
        where: {
          phoneNumber: { not: null },
          ...scopeToCompany(activeCompanyId),
        },
      }),
      prisma.client.findMany({
        select: { phoneNumber: true },
        where: {
          phoneNumber: { not: null },
          ...scopeToCompany(activeCompanyId),
        },
      }),
    ]);

    const existingPhones = new Set<string>();
    for (const l of existingLeads) {
      const key = normalizePhoneKey(l.phoneNumber);
      if (key) existingPhones.add(key);
    }
    for (const c of existingClients) {
      const key = normalizePhoneKey(c.phoneNumber);
      if (key) existingPhones.add(key);
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
      followUpAt?: Date | null;
      companyId: string | null;
    }> = [];

    const batchSeenPhones = new Set<string>();
    let duplicateCount = 0;
    let invalidCount = 0;

    const defaultDivision = divisionInput === "THIRD_PARTY" ? "THIRD_PARTY" : "PCD_FRANCHISE";

    for (const row of dataRows) {
      const parsed = extractLead(row, mapping, defaultDivision, analysis.columnLabels);
      // No valid phone number anywhere in the row → invalid
      if (!parsed) {
        invalidCount++;
        continue;
      }
      const parsedPhone = parsed.phone;
      const rawName = parsed.name;
      const rawDivision: string = parsed.division;
      const rawCity = parsed.city;
      const rawState = parsed.state;
      const rawInquiry = parsed.inquiry;

      const phoneKey = normalizePhoneKey(parsedPhone.digits);
      if (!phoneKey || existingPhones.has(phoneKey) || batchSeenPhones.has(phoneKey)) {
        duplicateCount++;
        continue;
      }

      batchSeenPhones.add(phoneKey);
      existingPhones.add(phoneKey);

      const finalName = formatLeadName(rawName) || `Prospect ${parsedPhone.digits.slice(-4)}`;
      const noteDetails = rawInquiry || `Imported via Batch: ${batchTag}${rawCity ? ` (${rawCity}, ${rawState})` : ""}`;

      // Reconstruct row object for payload audit
      const rowObject: Record<string, any> = {};
      row.forEach((cell, idx) => {
        const key = headerRow[idx] || `Column_${idx + 1}`;
        rowObject[key] = cell;
      });

      leadsToInsert.push({
        source: LeadSource.EXCEL_IMPORT,
        sourceTag: batchTag,
        division: rawDivision || "PCD_FRANCHISE",
        inquiryDetails: noteDetails,
        rawPayload: {
          importedFile: file.name,
          batchTag,
          originalRow: rowObject,
        },
        name: finalName,
        phoneNumber: parsedPhone.formatted,
        city: rawCity || null,
        state: rawState || null,
        status: targetEmployee ? LeadStatus.ASSIGNED : LeadStatus.NEW,
        assignedEmployeeId: targetEmployee ? targetEmployee.id : null,
        followUpAt: getDefaultFollowUpDate(),
        companyId: activeCompanyId,
      });
    }

    if (leadsToInsert.length === 0) {
      if (duplicateCount > 0) {
        return NextResponse.json({
          success: true,
          allDuplicates: true,
          batchTag,
          message: `All ${duplicateCount} contact(s) in this spreadsheet already exist in your CRM database and were safely skipped. Zero duplicate leads were created, ensuring no duplicate data is shared with employees.`,
          totalRowsProcessed: dataRows.length,
          insertedCount: 0,
          duplicateCount,
          invalidCount,
          division: divisionInput,
          assignedTo: targetEmployee ? targetEmployee.name : "Unassigned Allotment Pool",
        });
      }

      const headerDiagnostic = headerRow.length > 0 ? `Detected columns: [${headerRow.filter(Boolean).join(", ")}]` : "No recognizable header row found.";
      return NextResponse.json(
        {
          success: false,
          error: `No valid new leads could be ingested. ${duplicateCount} duplicate phone numbers and ${invalidCount} invalid rows (missing 10-digit mobile numbers) were skipped. ${headerDiagnostic}`,
          insertedCount: 0,
          duplicateCount,
          invalidCount,
        },
        { status: 400 }
      );
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
          ...scopeToCompany(activeCompanyId),
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
      totalRowsProcessed: dataRows.length,
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
