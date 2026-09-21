import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";
import * as XLSX from "xlsx";

import { extractPhoneNumber, normalizePhoneKey } from "@/lib/phone-utils";

function cleanString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Dynamically detects which row contains the table headers.
 * Bypasses title headers, blank top rows, and metadata cards.
 * Avoids misclassifying rows with actual mobile numbers as headers.
 */
function findHeaderRowIndex(rows: any[][]): { headerRowIndex: number; hasHeader: boolean } {
  const headerKeywords = [
    "name", "party", "chemist", "doctor", "dr", "customer", "client", "firm", "person", "agency", "shop", "store", "stockist", "distributor", "dealer",
    "phone", "mobile", "mob", "whatsapp", "wapp", "wa", "cell", "tel", "calling", "contact",
    "city", "district", "dist", "town", "station", "location", "place", "state", "address", "hq", "area", "headquarter",
    "inquiry", "enquiry", "remark", "note", "product", "requirement", "division", "category", "segment"
  ];

  let bestIndex = 0;
  let maxMatches = 0;

  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    // If any cell in this row is already a valid phone number, it is almost certainly a data row, not a header row
    const hasPhoneData = row.some((cell) => extractPhoneNumber(cell) !== null);
    if (hasPhoneData) continue;

    let matches = 0;
    for (const cell of row) {
      if (cell !== null && cell !== undefined) {
        const norm = String(cell).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (norm && headerKeywords.some((kw) => norm.includes(kw))) {
          matches++;
        }
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestIndex = r;
    }
  }

  return { headerRowIndex: bestIndex, hasHeader: maxMatches >= 1 };
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
      return NextResponse.json({ error: "Uploaded spreadsheet contains no sheets" }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheetName];
    // Read as 2D array to accurately detect headers, title cards, and positions
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const nonEmptyRows = aoa.filter((row) => Array.isArray(row) && row.some((cell) => cleanString(cell) !== ""));

    if (nonEmptyRows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded spreadsheet contains no data rows." },
        { status: 400 }
      );
    }

    const { headerRowIndex, hasHeader } = findHeaderRowIndex(nonEmptyRows);
    const headerRow: string[] = hasHeader
      ? nonEmptyRows[headerRowIndex].map((c) => cleanString(c))
      : [];
    const dataRows = hasHeader ? nonEmptyRows.slice(headerRowIndex + 1) : nonEmptyRows;

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "Spreadsheet contains a header row but no lead data rows below it." },
        { status: 400 }
      );
    }

    // Map column types by analyzing header row
    const colTypes: Record<number, "name" | "phone" | "city" | "state" | "division" | "inquiry"> = {};
    headerRow.forEach((colName, idx) => {
      const k = colName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!k) return;

      if (
        k.includes("phone") ||
        k.includes("mobile") ||
        k.includes("whatsapp") ||
        k.includes("wapp") ||
        k.includes("wa") ||
        k.includes("cell") ||
        k.includes("tel") ||
        k.includes("calling") ||
        k === "mob" ||
        k === "mobno" ||
        k === "phoneno" ||
        k === "contactno" ||
        k === "contactnumber" ||
        (k.includes("contact") && !k.includes("person") && !k.includes("name"))
      ) {
        colTypes[idx] = "phone";
      } else if (
        k.includes("name") ||
        k.includes("party") ||
        k.includes("chemist") ||
        k.includes("doctor") ||
        k.includes("dr") ||
        k.includes("customer") ||
        k.includes("client") ||
        k.includes("firm") ||
        k.includes("agency") ||
        k.includes("person") ||
        k.includes("shop") ||
        k.includes("store") ||
        k.includes("stockist") ||
        k.includes("distributor") ||
        k.includes("dealer")
      ) {
        colTypes[idx] = "name";
      } else if (
        k.includes("city") ||
        k.includes("district") ||
        k.includes("dist") ||
        k.includes("town") ||
        k.includes("station") ||
        k.includes("location") ||
        k.includes("place") ||
        k.includes("hq") ||
        k.includes("headquarter") ||
        k.includes("territory") ||
        k.includes("area") ||
        k.includes("address")
      ) {
        colTypes[idx] = "city";
      } else if (
        k.includes("state") ||
        k.includes("province") ||
        k.includes("region") ||
        k.includes("zone")
      ) {
        colTypes[idx] = "state";
      } else if (
        k.includes("division") ||
        k.includes("category") ||
        k.includes("segment") ||
        k.includes("type") ||
        k.includes("franchise") ||
        k.includes("manufacturing")
      ) {
        colTypes[idx] = "division";
      } else if (
        k.includes("inquiry") ||
        k.includes("enquiry") ||
        k.includes("remark") ||
        k.includes("note") ||
        k.includes("requirement") ||
        k.includes("product") ||
        k.includes("detail") ||
        k.includes("comment")
      ) {
        colTypes[idx] = "inquiry";
      }
    });

    // Gather existing phone numbers from DB for deduplication (Both Leads and converted Clients)
    const [existingLeads, existingClients] = await Promise.all([
      prisma.lead.findMany({
        select: { phoneNumber: true },
        where: {
          phoneNumber: { not: null },
          ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
        },
      }),
      prisma.client.findMany({
        select: { phoneNumber: true },
        where: {
          phoneNumber: { not: null },
          ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
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
      companyId: string | null;
    }> = [];

    const batchSeenPhones = new Set<string>();
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const row of dataRows) {
      if (!Array.isArray(row) || !row.some((c) => cleanString(c) !== "")) {
        continue;
      }

      let rawName = "";
      let rawPhone = "";
      let rawCity = "";
      let rawState = "";
      let rawDivision = divisionInput;
      let rawInquiry = "";

      // 1. First pass: Map values by classified column header
      row.forEach((cell, idx) => {
        const val = cleanString(cell);
        if (!val) return;

        const type = colTypes[idx];
        if (type === "phone" && !rawPhone) {
          rawPhone = val;
        } else if (type === "name" && !rawName) {
          rawName = val;
        } else if (type === "city" && !rawCity) {
          rawCity = val;
        } else if (type === "state" && !rawState) {
          rawState = val;
        } else if (type === "division") {
          const lower = val.toLowerCase();
          if (lower.includes("third") || lower.includes("mfg") || lower.includes("contract") || lower.includes("party")) {
            rawDivision = "THIRD_PARTY";
          } else if (lower.includes("pcd") || lower.includes("franchise") || lower.includes("propaganda")) {
            rawDivision = "PCD_FRANCHISE";
          }
        } else if (type === "inquiry" && !rawInquiry) {
          rawInquiry = val;
        }
      });

      // 2. Second pass (Fallback): If rawPhone not found or invalid, scan ALL cells in the row
      let parsedPhone = extractPhoneNumber(rawPhone);
      if (!parsedPhone) {
        for (let idx = 0; idx < row.length; idx++) {
          const candidate = extractPhoneNumber(row[idx]);
          if (candidate) {
            parsedPhone = candidate;
            rawPhone = String(row[idx]);
            break;
          }
        }
      }

      // If no valid phone number exists anywhere in this row, mark invalid
      if (!parsedPhone) {
        invalidCount++;
        continue;
      }

      // 3. Fallback for Name: If no name header was matched, pick first non-numeric cell
      if (!rawName) {
        for (let idx = 0; idx < row.length; idx++) {
          const val = cleanString(row[idx]);
          if (!val) continue;
          if (val === rawPhone || extractPhoneNumber(val)) continue;
          if (val === rawCity || val === rawState) continue;
          if (val.length >= 2 && !/^\d+$/.test(val)) {
            rawName = val;
            break;
          }
        }
      }

      const phoneKey = normalizePhoneKey(parsedPhone.digits);
      if (!phoneKey || existingPhones.has(phoneKey) || batchSeenPhones.has(phoneKey)) {
        duplicateCount++;
        continue;
      }

      batchSeenPhones.add(phoneKey);
      existingPhones.add(phoneKey);

      const finalName = rawName || `Prospect ${parsedPhone.digits.slice(-4)}`;
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
