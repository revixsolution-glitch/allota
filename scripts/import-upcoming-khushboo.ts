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

export function parseDateTime(str: string): Date | null {
  if (!str || !str.trim()) return null;
  const s = str.trim();
  // Match DD/MM/YYYY or DD-MM-YYYY HH:mm(:ss)? (AM/PM)?
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    let [, dd, mm, yyyy, hh, min, sec, mer] = m;
    let h = hh ? parseInt(hh, 10) : 0;
    let m_val = min ? parseInt(min, 10) : 0;
    let s_val = sec ? parseInt(sec, 10) : 0;
    if (mer) {
      if (mer.toUpperCase() === "PM" && h < 12) h += 12;
      if (mer.toUpperCase() === "AM" && h === 12) h = 0;
    }
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m_val).padStart(2, "0")}:${String(s_val).padStart(2, "0")}+05:30`);
  }
  const d = new Date(s.includes("+") || s.endsWith("Z") ? s : s + "+05:30");
  return isNaN(d.getTime()) ? null : d;
}

export function formatPhoneNumber(dialCode: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  let code = dialCode?.trim() || "+91";
  if (!code.startsWith("+")) code = `+${code}`;
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

  const csvPath = process.argv[2] || "/var/www/allota-crm/Upcoming.csv";
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(content).slice(1);

  console.log(`Starting bulk import of ${rows.length} Upcoming leads for Khushboo (${employee.id})...`);

  let createdCount = 0;
  let updatedCount = 0;
  let remarkCount = 0;
  let followUpCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [name, phone, city, lastMsg, status, actNo, assignedTo, nextFollow, lastFollow, createdOn, source, dialCode] = row;

    if (!phone || !phone.trim()) continue;

    const formattedPhone = formatPhoneNumber(dialCode, phone);
    const rawName = name?.trim() || "";
    const cleanName = !rawName || rawName.toLowerCase() === "name" ? formattedPhone : rawName;

    const isMatured = (status || "").trim().toLowerCase() === "matured";
    const leadStatus = isMatured ? "CONVERTED" : "CONTACTED";

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

    const dCreated = parseDateTime(createdOn) || new Date();
    const dNext = parseDateTime(nextFollow);
    const dLast = parseDateTime(lastFollow);

    const payload = {
      dialingCode: dialCode || "91",
      totalActivities: parseInt(actNo || "0", 10),
      previousStatus: status,
      sourceName: source,
      importedFrom: "Upcoming.csv",
    };

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
          sourceTag: cleanSource || lead.sourceTag,
          followUpAt: dNext || lead.followUpAt,
          rawPayload: payload,
          updatedAt: dLast || new Date(),
        },
      });
      updatedCount++;
    } else {
      lead = await prisma.lead.create({
        data: {
          companyId,
          assignedEmployeeId: employee.id,
          name: cleanName,
          phoneNumber: formattedPhone,
          city: city?.trim() || null,
          status: leadStatus as any,
          source: leadSource as any,
          sourceTag: cleanSource || null,
          division: "PCD_FRANCHISE",
          inquiryDetails: `Historical lead from ${source}. Activities: ${actNo || 0}.`,
          rawPayload: payload,
          followUpAt: dNext,
          createdAt: dCreated,
          updatedAt: dLast || dCreated,
        },
      });
      createdCount++;
    }

    // Process Last Message as Lead Remark
    if (lastMsg && lastMsg.trim()) {
      const trimmedRemark = lastMsg.trim();
      const existingRemark = await prisma.leadRemark.findFirst({
        where: { leadId: lead.id, remark: trimmedRemark },
      });
      if (!existingRemark) {
        await prisma.leadRemark.create({
          data: {
            leadId: lead.id,
            employeeId: employee.id,
            remark: trimmedRemark,
            createdAt: dLast || dCreated,
          },
        });
        remarkCount++;
      }
    }

    // Process Next FollowUp as LeadFollowUpLog
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
            createdAt: dLast || dCreated,
          },
        });
        followUpCount++;
      }
    }

    if ((i + 1) % 20 === 0 || i + 1 === rows.length) {
      console.log(`[${i + 1}/${rows.length}] Processed: ${lead.name} (${lead.phoneNumber}) - Next FollowUp: ${dNext?.toLocaleDateString("en-IN") || "none"}`);
    }
  }

  console.log("\n=== UPCOMING LEADS IMPORT SUMMARY ===");
  console.log(`Total Rows in CSV: ${rows.length}`);
  console.log(`New Leads Created: ${createdCount}`);
  console.log(`Existing Leads Updated: ${updatedCount}`);
  console.log(`Remarks Added: ${remarkCount}`);
  console.log(`Scheduled Follow-ups Logged: ${followUpCount}`);
  console.log(`Assigned Employee: Khushboo (${employee.phoneNumber})`);
  console.log(`Company: Ekonmed Remedies Private Limited (${companyId})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
