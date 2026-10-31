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
  const m = str.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return new Date(str);
  let [, dd, mm, yyyy, hh, min, mer] = m;
  let h = parseInt(hh, 10);
  if (mer) {
    if (mer.toUpperCase() === "PM" && h < 12) h += 12;
    if (mer.toUpperCase() === "AM" && h === 12) h = 0;
  }
  return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(h).padStart(2, "0")}:${min}:00+05:30`);
}

export function parseIsoDateTime(str: string): Date | null {
  if (!str || !str.trim()) return null;
  const s = str.trim().replace(" ", "T");
  const d = new Date(s.includes("+") || s.endsWith("Z") ? s : s + "+05:30");
  return isNaN(d.getTime()) ? null : d;
}

export function formatPhoneNumber(dialCode: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const code = dialCode?.trim() || "+91";
  if (cleanPhone.length === 10) {
    return `${code} ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
  }
  return `${code} ${cleanPhone}`;
}

export async function importLeadRow(row: string[], companyId: string, employeeId: string) {
  const [name, phone, city, lastMsg, status, actNo, assignedTo, nextFollow, lastFollow, createdOn, source, dialCode] = row;

  const formattedPhone = formatPhoneNumber(dialCode, phone);
  const rawName = name?.trim() || "";
  const cleanName = !rawName || rawName.toLowerCase() === "name" ? formattedPhone : rawName;

  const isMatured = status.trim().toLowerCase() === "matured";
  const leadStatus = isMatured ? "CONVERTED" : "CONTACTED";

  // Map Source
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
  const dNext = parseIsoDateTime(nextFollow);
  const dLast = parseIsoDateTime(lastFollow);

  const payload = {
    dialingCode: dialCode || "+91",
    totalActivities: parseInt(actNo || "0", 10),
    previousStatus: status,
    sourceName: source,
  };

  let clientId: string | null = null;

  // If Matured, ensure Client record exists
  if (isMatured) {
    let client = await prisma.client.findFirst({
      where: { companyId, phoneNumber: formattedPhone },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          companyId,
          name: cleanName,
          phoneNumber: formattedPhone,
          assignedEmployeeId: employeeId,
          businessType: "PCD_FRANCHISE",
          status: "ACTIVE" as any,
          companyDetails: `Converted historical client (Source: ${source})`,
        },
      });
    }
    clientId = client.id;
  }

  // Check existing lead
  let lead = await prisma.lead.findFirst({
    where: { companyId, phoneNumber: formattedPhone },
  });

  if (lead) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        name: cleanName,
        city: city?.trim() || lead.city,
        status: leadStatus as any,
        source: leadSource as any,
        sourceTag: source?.trim() || lead.sourceTag,
        followUpAt: dNext || lead.followUpAt,
        clientId: clientId || lead.clientId,
        rawPayload: payload,
      },
    });
  } else {
    lead = await prisma.lead.create({
      data: {
        companyId,
        assignedEmployeeId: employeeId,
        name: cleanName,
        phoneNumber: formattedPhone,
        city: city?.trim() || null,
        status: leadStatus as any,
        source: leadSource as any,
        sourceTag: source?.trim() || null,
        division: "PCD_FRANCHISE",
        inquiryDetails: `Historical lead from ${source}. Activities: ${actNo || 0}.`,
        rawPayload: payload,
        followUpAt: dNext,
        clientId,
        createdAt: dCreated,
        updatedAt: dLast || dCreated,
      },
    });
  }

  // Create remark if lastMsg is provided
  if (lastMsg && lastMsg.trim()) {
    const existingRemark = await prisma.leadRemark.findFirst({
      where: { leadId: lead.id, remark: lastMsg.trim() },
    });
    if (!existingRemark) {
      await prisma.leadRemark.create({
        data: {
          leadId: lead.id,
          employeeId,
          remark: lastMsg.trim(),
          createdAt: dLast || dCreated,
        },
      });
    }
  }

  // Create FollowUp log if nextFollow is provided
  if (dNext) {
    const existingLog = await prisma.leadFollowUpLog.findFirst({
      where: { leadId: lead.id, scheduledFor: dNext },
    });
    if (!existingLog) {
      await prisma.leadFollowUpLog.create({
        data: {
          leadId: lead.id,
          employeeId,
          scheduledFor: dNext,
          createdAt: dLast || dCreated,
        },
      });
    }
  }

  return lead;
}

async function main() {
  const companyId = "cmvaqedgb000008jtxjxb8jxm";
  const employee = await prisma.employee.findFirst({
    where: { companyId, name: { contains: "Khushboo", mode: "insensitive" } },
  });
  if (!employee) throw new Error("Khushboo employee record not found");

  const csvPath = process.argv[2] || "/Users/kartikchaudhary/Documents/2.csv";
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(content).slice(1);

  console.log(`Starting bulk import of ${rows.length} leads for Khushboo (${employee.id})...`);

  let successCount = 0;
  let maturedCount = 0;
  let activeCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const lead = await importLeadRow(row, companyId, employee.id);
      successCount++;
      if (lead.status === "CONVERTED") maturedCount++;
      else activeCount++;

      if (successCount % 10 === 0 || successCount === rows.length) {
        console.log(`[${successCount}/${rows.length}] Processed: ${lead.name} (${lead.phoneNumber}) - ${lead.status}`);
      }
    } catch (err: any) {
      console.error(`Error on row ${i + 1} (${row[0]}):`, err?.message || err);
    }
  }

  console.log("\n=== IMPORT SUMMARY ===");
  console.log(`Total Leads Processed: ${successCount} / ${rows.length}`);
  console.log(`Active (In Progress) Leads: ${activeCount}`);
  console.log(`Converted (Matured) Clients: ${maturedCount}`);
  console.log(`Assigned Employee: Khushboo (${employee.phoneNumber})`);
  console.log(`Company: Ekonmed Remedies Private Limited (${companyId})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
