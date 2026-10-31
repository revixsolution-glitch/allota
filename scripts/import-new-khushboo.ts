import fs from "fs";
import { prisma } from "../src/lib/prisma";

export function parseCSV(csv: string) {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let cur = "";
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    const next = csv[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(cur);
      cur = "";
    } else if ((c === "\r" || c === "\n") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      if (row.some((x) => x.trim())) lines.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur || row.length > 0) {
    row.push(cur);
    if (row.some((x) => x.trim())) lines.push(row);
  }
  return lines;
}

export function parseCreatedOn(str: string): Date {
  if (!str || !str.trim()) return new Date();
  const trimmed = str.trim();
  const m1 = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m1) {
    let [, dd, mm, yyyy, hh, min, sec, mer] = m1;
    let h = parseInt(hh, 10);
    if (mer) {
      if (mer.toUpperCase() === "PM" && h < 12) h += 12;
      if (mer.toUpperCase() === "AM" && h === 12) h = 0;
    }
    const s = sec ? sec.padStart(2, "0") : "00";
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(h).padStart(2, "0")}:${min.padStart(2, "0")}:${s}+05:30`);
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function parseIsoDateTime(str: string): Date | null {
  if (!str || !str.trim()) return null;
  const s = str.trim().replace(" ", "T");
  const d = new Date(s.includes("+") || s.endsWith("Z") ? s : s + "+05:30");
  return isNaN(d.getTime()) ? null : d;
}

export function formatPhoneNumber(dialCode: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  let code = (dialCode || "").replace(/\D/g, "");
  if (!code || code === "91") code = "+91";
  else code = `+${code}`;

  if (cleanPhone.length === 10) {
    return `${code} ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
  }
  return `${code} ${cleanPhone}`;
}

async function main() {
  const companyId = "cmvaqedgb000008jtxjxb8jxm"; // Ekonmed Remedies
  const employee = await prisma.employee.findFirst({
    where: { companyId, name: { contains: "Khushboo", mode: "insensitive" } },
  });
  if (!employee) throw new Error("Khushboo employee record not found");

  const csvPath = process.argv[2] || "/Users/kartikchaudhary/Documents/New Khushboo.csv";
  if (!fs.existsSync(csvPath)) throw new Error(`File not found: ${csvPath}`);

  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(content).slice(1);

  console.log(`Starting bulk import of ${rows.length} New leads for Khushboo (${employee.id})...`);

  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [
      name,
      email, // Ignored per user instruction
      phone,
      query, // Query is remarks
      location,
      createdOn,
      source,
      status, // "New"
      assignedTo,
      nextFollowUp,
      companyName,
      gstin,
      pan,
      dialCode,
    ] = row;

    const formattedPhone = formatPhoneNumber(dialCode, phone);
    const rawName = name?.trim() || "";
    const cleanName = !rawName || rawName.toLowerCase() === "name" ? formattedPhone : rawName;

    const leadStatus = "NEW";

    // Source mapping
    let leadSource: "MANUAL" | "META" = "MANUAL";
    const cleanSource = (source || "").trim();
    if (
      cleanSource.toLowerCase().includes("facebook") ||
      cleanSource.toLowerCase().includes("instagram") ||
      cleanSource.toLowerCase().includes("meta")
    ) {
      leadSource = "META";
    }

    const dCreated = parseCreatedOn(createdOn);
    const dNext = parseIsoDateTime(nextFollowUp);

    const payload = {
      dialingCode: dialCode || "91",
      previousStatus: status || "New",
      sourceName: source,
      companyNameLegalName: companyName?.trim() || null,
      gstin: gstin?.trim() || null,
      pan: pan?.trim() || null,
    };

    const cleanLocation = location?.trim() || null;
    const cleanQuery = query?.trim() || null;

    let lead = await prisma.lead.findFirst({
      where: { companyId, phoneNumber: formattedPhone },
    });

    if (lead) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: cleanName,
          city: cleanLocation || lead.city,
          status: leadStatus as any,
          source: leadSource as any,
          sourceTag: source?.trim() || lead.sourceTag,
          inquiryDetails: cleanQuery || lead.inquiryDetails,
          rawPayload: payload,
          followUpAt: dNext || lead.followUpAt,
        },
      });
    } else {
      lead = await prisma.lead.create({
        data: {
          companyId,
          assignedEmployeeId: employee.id,
          name: cleanName,
          phoneNumber: formattedPhone,
          city: cleanLocation,
          status: leadStatus as any,
          source: leadSource as any,
          sourceTag: source?.trim() || null,
          division: "PCD_FRANCHISE",
          inquiryDetails: cleanQuery || "Fresh lead received.",
          rawPayload: payload,
          followUpAt: dNext,
          createdAt: dCreated,
          updatedAt: dCreated,
        },
      });
    }

    // "query is remarks": create remark if query is present
    if (cleanQuery) {
      const existingRemark = await prisma.leadRemark.findFirst({
        where: { leadId: lead.id, remark: cleanQuery },
      });
      if (!existingRemark) {
        await prisma.leadRemark.create({
          data: {
            leadId: lead.id,
            employeeId: employee.id,
            remark: cleanQuery,
            createdAt: dCreated,
          },
        });
      }
    }

    // FollowUp log if present
    if (dNext) {
      const existingLog = await prisma.leadFollowUpLog.findFirst({
        where: { leadId: lead.id, scheduledFor: dNext },
      });
      if (!existingLog) {
        await prisma.leadFollowUpLog.create({
          data: {
            leadId: lead.id,
            employeeId: employee.id,
            scheduledFor: dNext,
            createdAt: dCreated,
          },
        });
      }
    }

    successCount++;
    console.log(`[${successCount}/${rows.length}] New Lead: ${lead.name} (${lead.phoneNumber}) | Source: ${leadSource} (${source}) | Remark: ${cleanQuery ? "Yes" : "None"}`);
  }

  console.log("\n=== NEW LEADS IMPORT SUMMARY ===");
  console.log(`Total New Leads Processed: ${successCount} / ${rows.length}`);
  console.log(`Status: NEW (Fresh Leads)`);
  console.log(`Assigned Employee: Khushboo (${employee.phoneNumber})`);
  console.log(`Company: Ekonmed Remedies Private Limited (${companyId})`);
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
