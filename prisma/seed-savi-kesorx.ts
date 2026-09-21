import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { LeadSource, LeadStatus, Role, ClientStatus } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Creating new test employee: Savi Kesorx...");

  // 1. Find the target company (Pharma Life Sciences Pvt Ltd)
  let company = await prisma.company.findFirst({
    where: { slug: "pharma-life" },
  });

  if (!company) {
    company = await prisma.company.findFirst();
  }

  if (!company) {
    throw new Error("No company found in database");
  }

  console.log(`Assigning to company: ${company.name} (${company.id})`);

  // 2. Hash default password
  const passwordHash = await bcrypt.hash("employee123", 10);
  const email = "savi.kesorx@pharmacrm.test";
  const phoneNumber = "+91 98722 44331";
  const name = "Savi Kesorx";

  // 3. Upsert User
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.EMPLOYEE,
        companyId: company.id,
      },
    });
    console.log(`Created User: ${user.email} (${user.id})`);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        companyId: company.id,
        role: Role.EMPLOYEE,
      },
    });
    console.log(`Updated User: ${user.email} (${user.id})`);
  }

  // 4. Upsert Employee
  let employee = await prisma.employee.findUnique({
    where: { userId: user.id },
  });

  if (!employee) {
    // Check if phone number already exists
    const existingPhone = await prisma.employee.findUnique({ where: { phoneNumber } });
    const finalPhone = existingPhone ? `+91 98722 ${Math.floor(10000 + Math.random() * 90000)}` : phoneNumber;

    employee = await prisma.employee.create({
      data: {
        userId: user.id,
        companyId: company.id,
        name,
        phoneNumber: finalPhone,
      },
    });
    console.log(`Created Employee: ${employee.name} (${employee.id})`);
  } else {
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        name,
        companyId: company.id,
      },
    });
    console.log(`Updated Employee: ${employee.name} (${employee.id})`);
  }

  // 5. Territory (Punjab / Ludhiana)
  let territory = await prisma.territory.findFirst({
    where: { state: "Punjab", city: "Ludhiana" },
  });

  if (!territory) {
    territory = await prisma.territory.findFirst();
  }

  // 6. Seed Clients for Savi
  const existingClient = await prisma.client.findFirst({
    where: { name: "Kesorx Remedies & Health Distributors", companyId: company.id },
  });

  let client = existingClient;
  if (!client) {
    client = await prisma.client.create({
      data: {
        companyId: company.id,
        name: "Kesorx Remedies & Health Distributors",
        phoneNumber: "+91 98140 33221",
        companyDetails: "GSTIN: 03AABCK4499P1Z3, DL: PB-CDG-882194 (Chandigarh / Punjab Region)",
        territoryId: territory?.id,
        assignedEmployeeId: employee.id,
        status: ClientStatus.ACTIVE,
        businessType: "PCD_FRANCHISE",
        isRepeatCustomer: true,
        avgReorderIntervalDays: 25,
        typicalOrderDayOfMonth: 7,
      },
    });
    console.log(`Created Client: ${client.name}`);
  } else {
    await prisma.client.update({
      where: { id: client.id },
      data: { assignedEmployeeId: employee.id },
    });
  }

  // 7. Seed Attendance Sessions (Today Active + Past 4 Days)
  const now = new Date();
  const daysAgo = (d: number, h: number, m: number) => {
    const dt = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    dt.setHours(h, m, 0, 0);
    return dt;
  };

  await prisma.employeeSession.deleteMany({ where: { employeeId: employee.id } });

  // Today active session
  await prisma.employeeSession.create({
    data: {
      employeeId: employee.id,
      loginTime: daysAgo(0, 9, 15),
      logoutTime: null,
      workingHours: 6.2,
      status: "ACTIVE",
      deviceInfo: "Android 14 / Chrome Mobile (OnePlus 12 Field Device)",
      ipAddress: "192.168.1.118",
    },
  });

  // Past completed sessions
  const pastSessions = [
    { d: 1, inH: 9, inM: 10, outH: 18, outM: 30, h: 9.33 },
    { d: 2, inH: 9, inM: 0, outH: 18, outM: 15, h: 9.25 },
    { d: 3, inH: 8, inM: 50, outH: 18, outM: 0, h: 9.17 },
    { d: 4, inH: 9, inM: 20, outH: 17, outM: 45, h: 8.42 },
  ];

  for (const s of pastSessions) {
    await prisma.employeeSession.create({
      data: {
        employeeId: employee.id,
        loginTime: daysAgo(s.d, s.inH, s.inM),
        logoutTime: daysAgo(s.d, s.outH, s.outM),
        workingHours: s.h,
        status: "COMPLETED",
        deviceInfo: "Android 14 / Chrome Mobile (OnePlus 12 Field Device)",
        ipAddress: "192.168.1.118",
      },
    });
  }

  // 8. Seed Realistic Leads for Savi
  const leadsData = [
    {
      source: LeadSource.INDIAMART,
      sourceTag: "IndiaMART Verified PCD",
      division: "PCD_FRANCHISE",
      name: "Dr. Sandeep Oberoi",
      phoneNumber: "+91 98881 22334",
      city: "Mohali",
      state: "Punjab",
      status: LeadStatus.INTERESTED,
      inquiryDetails: "Requires monopoly PCD franchise rights for Mohali & Zirakpur zone. High demand for Antibiotics and Pediatric range. Requested product list and net rate card.",
    },
    {
      source: LeadSource.WHATSAPP,
      sourceTag: "Direct WhatsApp Inbound",
      division: "PCD_FRANCHISE",
      name: "Amanjot Kaur (Patiala Medicos)",
      phoneNumber: "+91 98765 44321",
      city: "Patiala",
      state: "Punjab",
      status: LeadStatus.CONTACTED,
      inquiryDetails: "Discussed initial stock order for Cefixime 200mg DT and Pantoprazole DSR. Requested sample visual aids and 30-day payment terms.",
    },
    {
      source: LeadSource.META,
      sourceTag: "Facebook Lead Campaign",
      division: "THIRD_PARTY",
      name: "Verma Healthcare LLP",
      phoneNumber: "+91 94170 88990",
      city: "Chandigarh",
      state: "Punjab",
      status: LeadStatus.NEW,
      inquiryDetails: "Third-party contract manufacturing inquiry for 10,000 boxes of gastro & anti-inflammatory capsules. Requires quotation with GST breakdown.",
    },
    {
      source: LeadSource.MANUAL,
      sourceTag: "Chemist Conference Meet",
      division: "PCD_FRANCHISE",
      name: "Singla Medical Agency",
      phoneNumber: "+91 98144 55667",
      city: "Bathinda",
      state: "Punjab",
      status: LeadStatus.CONVERTED,
      inquiryDetails: "Successfully closed PCD franchise deal for Bathinda district. Initial advance payment received, first consignment scheduled.",
    },
  ];

  for (const ld of leadsData) {
    const existing = await prisma.lead.findFirst({
      where: { phoneNumber: ld.phoneNumber, companyId: company.id },
    });

    let leadId = existing?.id;
    if (!existing) {
      const created = await prisma.lead.create({
        data: {
          ...ld,
          companyId: company.id,
          assignedEmployeeId: employee.id,
        },
      });
      leadId = created.id;
      console.log(`Created Lead: ${ld.name}`);
    } else {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { assignedEmployeeId: employee.id },
      });
      leadId = existing.id;
    }

    // Seed realistic Call for this lead
    const existingCall = await prisma.call.findFirst({
      where: { leadId, employeeId: employee.id },
    });

    if (!existingCall && leadId) {
      if (ld.status === LeadStatus.INTERESTED) {
        await prisma.call.create({
          data: {
            employeeId: employee.id,
            leadId,
            direction: "OUTBOUND",
            missed: false,
            durationSec: 215,
            occurredAt: daysAgo(0, 11, 30),
            transcript: "Savi: Hello Dr. Sandeep, I am Savi from Allota Pharma. Calling regarding your PCD franchise inquiry for Mohali.\nDr. Sandeep: Yes Savi, I need monopoly rights for Mohali & Zirakpur. Can you share the pediatric catalogue?\nSavi: Absolutely Doctor, sending the full DCGI-approved catalogue and margin structure on WhatsApp right away.",
            aiSummary: "Doctor confirmed strong interest in PCD monopoly franchise for Mohali and Zirakpur. Wants pediatric dry syrups and antibiotics. Requested quotation and rate card via WhatsApp.",
            behaviorTags: ["High Intent", "PCD Franchise", "Monopoly Rights", "Pediatric Range"],
            whatsappSent: true,
          },
        });
      } else if (ld.status === LeadStatus.NEW) {
        // Missed incoming call
        await prisma.call.create({
          data: {
            employeeId: employee.id,
            leadId,
            direction: "INBOUND",
            missed: true,
            durationSec: 0,
            occurredAt: daysAgo(0, 13, 10),
            aiSummary: "Incoming client inquiry missed during transit. Automatically routed to Savi's priority callback queue.",
            behaviorTags: ["Missed Call", "Callback Scheduled"],
          },
        });
      }
    }
  }

  // 9. Followup Task
  const existingTask = await prisma.followupTask.findFirst({
    where: { assignedEmployeeId: employee.id },
  });

  if (!existingTask && client) {
    await prisma.followupTask.create({
      data: {
        clientId: client.id,
        assignedEmployeeId: employee.id,
        title: "Share Monopoly Distribution Agreement & Price Quotation",
        description: "Send official PCD Monopoly Distribution Agreement for Punjab territory and dispatch visual aid sample kit.",
        taskType: "REORDER_FOLLOWUP",
        priority: "HIGH",
        status: "PENDING",
        dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    console.log("Created Followup Task for Savi Kesorx");
  }

  console.log("\n=======================================================");
  console.log(" SUCCESS: Test Employee 'Savi Kesorx' is fully ready!");
  console.log("=======================================================");
  console.log(`Name:        ${employee.name}`);
  console.log(`Employee ID: ${employee.id}`);
  console.log(`Email:       ${email}`);
  console.log(`Password:    employee123`);
  console.log(`Phone:       ${employee.phoneNumber}`);
  console.log(`Company:     ${company.name}`);
  console.log("=======================================================\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
