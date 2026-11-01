import fs from "fs";
import { prisma } from "../src/lib/prisma";

export function parseCSV(csv: string): string[][] {
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
  // Support DD-MM-YYYY hh:mm AM/PM or DD/MM/YYYY hh:mm AM/PM
  const m = str.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!m) {
    const fallback = new Date(str.includes("+") || str.endsWith("Z") ? str : str + "+05:30");
    return isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  let [, dd, mm, yyyy, hh, min, sec, mer] = m;
  let h = hh ? parseInt(hh, 10) : 0;
  const m_val = min ? parseInt(min, 10) : 0;
  const s_val = sec ? parseInt(sec, 10) : 0;
  if (mer) {
    const upper = mer.toUpperCase();
    if (upper === "PM" && h < 12) h += 12;
    if (upper === "AM" && h === 12) h = 0;
  }
  return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m_val).padStart(2, "0")}:${String(s_val).padStart(2, "0")}+05:30`);
}

export function formatPhoneNumber(dialCode: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  let code = dialCode?.trim() || "+91";
  if (code === "226" || !code.startsWith("+")) {
    // If it's a 10 digit Indian number, standard is +91
    code = cleanPhone.length === 10 ? "+91" : `+${code}`;
  }
  if (cleanPhone.length === 10) {
    return `${code} ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
  }
  return `${code} ${cleanPhone}`;
}

async function main() {
  const companyId = "cmvaqedgb000008jtxjxb8jxm"; // Ekonmed Remedies Private Limited
  const employee = await prisma.employee.findFirst({
    where: { companyId, name: { contains: "Khushboo", mode: "insensitive" } },
  });
  if (!employee) throw new Error("Khushboo employee record not found for Ekonmed");

  const csvPath = process.argv[2] || "/Users/kartikchaudhary/Documents/Not Relavant Khushboo.csv";
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(content).slice(1);

  console.log(`Starting bulk import of ${rows.length} Irrelevant Dead leads for Khushboo (${employee.id})...`);
  console.log(`Rule: Query is stored in inquiryDetails (NOT remarks). Category is IRRELEVANT under Dead Leads.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [
      name,
      email,
      phone,
      query,
      location,
      createdOn,
      source,
      status,
      assignedTo,
      nextFollowUp,
      companyName,
      gstin,
      pan,
      dialCode,
    ] = row;

    if (!phone || !phone.trim()) continue;

    const formattedPhone = formatPhoneNumber(dialCode, phone);
    const rawName = name?.trim() || "";
    const cleanName = !rawName || rawName.toLowerCase() === "name" ? formattedPhone : rawName;

    // Source mapping as per CRM source rules
    let leadSource: "MANUAL" | "META" = "MANUAL";
    const cleanSource = (source || "").trim().toLowerCase();
    if (cleanSource.includes("facebook") || cleanSource.includes("instagram") || cleanSource.includes("meta")) {
      leadSource = "META";
    }

    const dCreated = parseCreatedOn(createdOn);
    const cleanLocation = location?.trim() || null;
    const cleanQuery = query?.trim() || null;

    const payload = {
      importedFrom: "Not Relavant Khushboo.csv",
      dialingCode: dialCode || "+91",
      originalStatus: status || "Not Relevant",
      originalSource: source,
      query: cleanQuery,
      companyNameLegalName: companyName?.trim() || null,
      gstin: gstin?.trim() || null,
      pan: pan?.trim() || null,
    };

    let lead = await prisma.lead.findFirst({
      where: { companyId, phoneNumber: formattedPhone },
    });

    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: cleanName,
          city: cleanLocation || lead.city,
          status: "NOT_INTERESTED",
          deadReason: "IRRELEVANT",
          deadAt: dCreated,
          assignedEmployeeId: employee.id,
          source: leadSource as any,
          sourceTag: null, // No clutter tags as per user instructions
          inquiryDetails: cleanQuery || lead.inquiryDetails,
          rawPayload: payload,
          updatedAt: dCreated,
        },
      });
      updatedCount++;
    } else {
      await prisma.lead.create({
        data: {
          companyId,
          assignedEmployeeId: employee.id,
          name: cleanName,
          phoneNumber: formattedPhone,
          city: cleanLocation,
          status: "NOT_INTERESTED",
          deadReason: "IRRELEVANT",
          deadAt: dCreated,
          source: leadSource as any,
          sourceTag: null,
          division: "PCD_FRANCHISE",
          inquiryDetails: cleanQuery || null,
          rawPayload: payload,
          createdAt: dCreated,
          updatedAt: dCreated,
        },
      });
      createdCount++;
    }

    // NOTE: Explicitly NO LeadRemark is created because the user stated:
    // "querry is not remarks note that & this will be under irrelevent under dead leads under khushboo"
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Newly created irrelevant leads: ${createdCount}`);
  console.log(`Updated existing leads to irrelevant: ${updatedCount}`);
  console.log(`Remarks created: 0 (Explicitly excluded as per instruction)`);
  console.log(`Status: NOT_INTERESTED`);
  console.log(`deadReason: IRRELEVANT`);
  console.log(`Assigned To: Khushboo (${employee.name})`);
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
