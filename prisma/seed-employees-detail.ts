import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding comprehensive employee attendance, leads, calls, and clients...");

  const now = new Date();
  const daysAgo = (d: number, hour = 9, min = 15) => {
    const dt = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    dt.setHours(hour, min, 0, 0);
    return dt;
  };

  const employees = await prisma.employee.findMany({ include: { user: true } });
  const amit = employees.find((e) => e.name.includes("Amit")) || employees[0];
  const rahul = employees.find((e) => e.name.includes("Rahul")) || employees[1];
  const priya = employees.find((e) => e.name.includes("Priya")) || employees[2];

  // 1. Seed Attendance Sessions for Amit Verma (Past 10 days)
  console.log(`Seeding attendance sessions for ${amit.name}...`);
  await prisma.employeeSession.deleteMany({ where: { employeeId: amit.id } });

  const sessionHistory = [
    { d: 0, loginH: 9, loginM: 12, logoutH: null, logoutM: null, hours: 5.4, status: "ACTIVE" }, // Today active
    { d: 1, loginH: 9, loginM: 5, logoutH: 18, logoutM: 45, hours: 9.67, status: "COMPLETED" },
    { d: 2, loginH: 9, loginM: 15, logoutH: 18, logoutM: 30, hours: 9.25, status: "COMPLETED" },
    { d: 3, loginH: 8, loginM: 55, logoutH: 18, logoutM: 15, hours: 9.33, status: "COMPLETED" },
    { d: 4, loginH: 9, loginM: 10, logoutH: 18, logoutM: 20, hours: 9.17, status: "COMPLETED" },
    { d: 5, loginH: 9, loginM: 20, logoutH: 17, logoutM: 45, hours: 8.42, status: "COMPLETED" },
    { d: 6, loginH: 9, loginM: 0, logoutH: 18, logoutM: 30, hours: 9.50, status: "COMPLETED" },
    { d: 7, loginH: 9, loginM: 15, logoutH: 18, logoutM: 40, hours: 9.42, status: "COMPLETED" },
    { d: 8, loginH: 9, loginM: 10, logoutH: 18, logoutM: 15, hours: 9.08, status: "COMPLETED" },
    { d: 9, loginH: 9, loginM: 25, logoutH: 18, logoutM: 50, hours: 9.42, status: "COMPLETED" },
  ];

  for (const s of sessionHistory) {
    const loginTime = daysAgo(s.d, s.loginH, s.loginM);
    const logoutTime = s.logoutH !== null ? daysAgo(s.d, s.logoutH, s.logoutM || 0) : null;
    await prisma.employeeSession.create({
      data: {
        employeeId: amit.id,
        loginTime,
        logoutTime,
        workingHours: s.hours,
        status: s.status,
        deviceInfo: "Android 14 / Chrome Mobile (Samsung Galaxy A54 Field Device)",
        ipAddress: "192.168.1.108",
      },
    });
  }

  // Also seed attendance for Rahul & Priya
  for (const rep of [rahul, priya]) {
    if (rep && rep.id !== amit.id) {
      await prisma.employeeSession.deleteMany({ where: { employeeId: rep.id } });
      await prisma.employeeSession.create({
        data: {
          employeeId: rep.id,
          loginTime: daysAgo(0, 9, 30),
          logoutTime: null,
          workingHours: 4.8,
          status: "ACTIVE",
          deviceInfo: "Chrome Mobile / Field Device",
          ipAddress: "192.168.1.112",
        },
      });
      await prisma.employeeSession.create({
        data: {
          employeeId: rep.id,
          loginTime: daysAgo(1, 9, 10),
          logoutTime: daysAgo(1, 18, 30),
          workingHours: 9.33,
          status: "COMPLETED",
          deviceInfo: "Chrome Mobile / Field Device",
          ipAddress: "192.168.1.112",
        },
      });
    }
  }

  // 2. Seed Rich Clients for Amit Verma (New vs Repeat / Old Clients)
  console.log(`Linking & adding new clients for ${amit.name}...`);
  // Ensure Pune territory
  const puneTerritory = await prisma.territory.findFirst({ where: { city: "Pune" } });
  const maharashtraTerritory = puneTerritory || (await prisma.territory.create({
    data: { state: "Maharashtra", city: "Pune" }
  }));

  // Client 1: Old / Repeat Customer
  const skLife = await prisma.client.findFirst({ where: { name: "Shree Krishna Life Sciences" } });
  if (skLife) {
    await prisma.client.update({
      where: { id: skLife.id },
      data: {
        assignedEmployeeId: amit.id,
        isRepeatCustomer: true,
      },
    });
  }

  // Client 2: New Client onboarded 15 days ago
  let swastik = await prisma.client.findFirst({ where: { name: "Swastik Bio-Pharma Distributors" } });
  if (!swastik) {
    swastik = await prisma.client.create({
      data: {
        name: "Swastik Bio-Pharma Distributors",
        companyDetails: "GSTIN: 27AABCS9912E1Z8 | DL: MH-PUN-882201",
        phoneNumber: "+91 98220 33445",
        businessType: "PCD_FRANCHISE",
        status: "ACTIVE",
        isRepeatCustomer: false, // New client
        avgReorderIntervalDays: 30,
        typicalOrderDayOfMonth: 12,
        reorderAlertCadence: "MONTHLY",
        assignedEmployeeId: amit.id,
        territoryId: maharashtraTerritory.id,
        createdAt: daysAgo(18),
      },
    });

    // Initial Order for Swastik
    const pcm = await prisma.product.findFirst();
    await prisma.order.create({
      data: {
        clientId: swastik.id,
        amount: 125000,
        orderDate: daysAgo(18),
        invoiceNumber: "INV-SWAS-01",
        billingSource: "Marg ERP 9+",
        orderStatus: "DELIVERED",
        items: pcm ? {
          create: [{ productId: pcm.id, quantity: 2500, price: 50.0 }]
        } : undefined,
      },
    });
  } else {
    await prisma.client.update({
      where: { id: swastik.id },
      data: { assignedEmployeeId: amit.id },
    });
  }

  // Client 3: New Client onboarded 10 days ago
  let niramay = await prisma.client.findFirst({ where: { name: "Niramay Health Remedies" } });
  if (!niramay) {
    niramay = await prisma.client.create({
      data: {
        name: "Niramay Health Remedies",
        companyDetails: "GSTIN: 27AABCN4421B1Z3 | DL: MH-SOL-771102",
        phoneNumber: "+91 98500 77889",
        businessType: "PCD_FRANCHISE",
        status: "ACTIVE",
        isRepeatCustomer: false, // New client
        avgReorderIntervalDays: 30,
        typicalOrderDayOfMonth: 20,
        reorderAlertCadence: "MONTHLY",
        assignedEmployeeId: amit.id,
        territoryId: maharashtraTerritory.id,
        createdAt: daysAgo(10),
      },
    });

    const panto = await prisma.product.findFirst({ where: { sku: { contains: "PAN" } } });
    await prisma.order.create({
      data: {
        clientId: niramay.id,
        amount: 95000,
        orderDate: daysAgo(10),
        invoiceNumber: "INV-NIR-01",
        billingSource: "Marg ERP 9+",
        orderStatus: "DELIVERED",
        items: panto ? {
          create: [{ productId: panto.id, quantity: 2000, price: 47.5 }]
        } : undefined,
      },
    });
  } else {
    await prisma.client.update({
      where: { id: niramay.id },
      data: { assignedEmployeeId: amit.id },
    });
  }

  // 3. Seed Comprehensive Leads Handled by Amit Verma (Dead, Interested, Follow-up, Talking, Converted)
  console.log(`Seeding comprehensive lead funnel for ${amit.name}...`);
  // Remove existing leads for amit to cleanly populate full funnel
  await prisma.lead.deleteMany({ where: { assignedEmployeeId: amit.id } });

  const amitLeads = [
    // Converted
    {
      name: "Rajesh Kulkarni (Shree Krishna Life Sciences)",
      phoneNumber: "+91 98505 66778",
      source: "INDIAMART" as const,
      status: "CONVERTED" as const,
      inquiryDetails: "Exclusive PCD Monopoly for Pune district finalized. Initial order ₹1.6L cleared.",
      createdAt: daysAgo(45),
    },
    {
      name: "Sachin Patil (Swastik Bio-Pharma)",
      phoneNumber: "+91 98220 33445",
      source: "META" as const,
      status: "CONVERTED" as const,
      inquiryDetails: "Meta lead for Kolhapur territory franchise. Agreed to ₹1.25L initial order with visual aids.",
      createdAt: daysAgo(20),
    },
    {
      name: "Dr. Vinayak Deshmukh (Niramay Health)",
      phoneNumber: "+91 98500 77889",
      source: "WEBSITE" as const,
      status: "CONVERTED" as const,
      inquiryDetails: "Website direct inquiry for Solapur antibiotics dealership. Wholesale license approved.",
      createdAt: daysAgo(12),
    },

    // Interested
    {
      name: "Shree Ganesh Remedies (Mr. Anand)",
      phoneNumber: "+91 98231 11223",
      source: "INDIAMART" as const,
      status: "INTERESTED" as const,
      inquiryDetails: "High interest in Cardiac & Diabetic range for Pimpri-Chinchwad. Requested visual aid brochure and Marg net price list.",
      createdAt: daysAgo(4),
    },
    {
      name: "Vardhman Medical Distributors",
      phoneNumber: "+91 98901 44556",
      source: "META" as const,
      status: "INTERESTED" as const,
      inquiryDetails: "Inquired via Facebook Lead Form for Pediatric drops & syrups. Has 8 medical representatives in field.",
      createdAt: daysAgo(6),
    },
    {
      name: "Kothari Healthcare Agency",
      phoneNumber: "+91 94220 88990",
      source: "WHATSAPP" as const,
      status: "INTERESTED" as const,
      inquiryDetails: "WhatsApp inquiry for Satara rural territory monopoly. Liked product packaging and GST invoice terms.",
      createdAt: daysAgo(8),
    },

    // Follow-up / Talking / In Talks
    {
      name: "Sai Krupa Pharma Traders",
      phoneNumber: "+91 98225 77112",
      source: "INDIAMART" as const,
      status: "CONTACTED" as const,
      inquiryDetails: "Talking with proprietor Mr. Ramesh. Discussing 30-day credit limit and first batch delivery timeline.",
      createdAt: daysAgo(2),
    },
    {
      name: "Patil Agencies & Surgicals",
      phoneNumber: "+91 94230 55441",
      source: "MANUAL" as const,
      status: "CONTACTED" as const,
      inquiryDetails: "Field visit completed by Amit. Wholesale drug license copy collected. Franchise agreement draft shared.",
      createdAt: daysAgo(3),
    },
    {
      name: "Dhanvantari Medicos",
      phoneNumber: "+91 98504 22331",
      source: "WEBSITE" as const,
      status: "ASSIGNED" as const,
      inquiryDetails: "Assigned today. Inquired for Ahmednagar PCD franchise rights. Follow-up call scheduled for 4 PM.",
      createdAt: daysAgo(1),
    },

    // Dead Leads (Marked Not Interested / Dead by Amit)
    {
      name: "Sanjay Medical Stores",
      phoneNumber: "+91 98222 99001",
      source: "INDIAMART" as const,
      status: "NOT_INTERESTED" as const,
      inquiryDetails: "DEAD LEAD (Marked by Amit): Wanted 60-day credit on very first order with no advance. Refused company security terms.",
      createdAt: daysAgo(15),
    },
    {
      name: "Om Life Sciences Retail",
      phoneNumber: "+91 94221 66554",
      source: "META" as const,
      status: "NOT_INTERESTED" as const,
      inquiryDetails: "DEAD LEAD (Marked by Amit): Territory already allotted to cousin who holds exclusive rights. Chose not to proceed.",
      createdAt: daysAgo(18),
    },
    {
      name: "Apex Chemists & Druggists",
      phoneNumber: "+91 98900 12345",
      source: "SOCIAL" as const,
      status: "NOT_INTERESTED" as const,
      inquiryDetails: "DEAD LEAD (Marked by Amit): Single retail counter only, does not have wholesale drug distribution infrastructure.",
      createdAt: daysAgo(25),
    },
  ];

  for (const ld of amitLeads) {
    await prisma.lead.create({
      data: {
        name: ld.name,
        phoneNumber: ld.phoneNumber,
        source: ld.source,
        status: ld.status,
        division: "PCD_FRANCHISE",
        inquiryDetails: ld.inquiryDetails,
        assignedEmployeeId: amit.id,
        createdAt: ld.createdAt,
      },
    });
  }

  // 4. Seed Daily Calls Made by Amit Verma (Past 7 days)
  console.log(`Seeding daily calling activity for ${amit.name}...`);
  await prisma.call.deleteMany({ where: { employeeId: amit.id } });

  const amitCalls = [
    // Today
    {
      d: 0,
      hour: 10,
      min: 15,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Sai Krupa Pharma Traders",
      durationSec: 285,
      transcript: "Discussed initial stock requirements for Paracetamol 650 and Pantoprazole DSR. Client requested visual aid brochure via WhatsApp.",
      aiSummary: "Commercial terms discussed. Quotation approved in principle. WhatsApp catalog dispatched.",
      tags: ["HOT_LEAD", "QUOTATION", "CATALOG_SENT"],
      whatsapp: true,
    },
    {
      d: 0,
      hour: 11,
      min: 40,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Shree Krishna Life Sciences",
      durationSec: 195,
      transcript: "Reminder call regarding overdue invoice INV-2026-CR03. Mr. Rajesh confirmed NEFT payment will be initiated today by 3 PM.",
      aiSummary: "Payment commitment obtained for ₹1,20,000 overdue balance.",
      tags: ["OVERDUE_PAYMENT", "PROMISED_TO_PAY"],
      whatsapp: true,
    },
    {
      d: 0,
      hour: 12,
      min: 20,
      direction: "OUTBOUND",
      missed: true,
      targetName: "Dhanvantari Medicos",
      durationSec: 0,
      transcript: null,
      aiSummary: "Client did not answer. Automated WhatsApp introduction sent.",
      tags: ["MISSED_CALL", "WHATSAPP_INTRO"],
      whatsapp: true,
    },
    {
      d: 0,
      hour: 14,
      min: 10,
      direction: "INBOUND",
      missed: false,
      targetName: "Shree Ganesh Remedies",
      durationSec: 340,
      transcript: "Incoming call from proprietor inquiring about monopoly contract terms and sample kit availability.",
      aiSummary: "Inbound query. High interest in franchise dealership. Sample kit dispatched.",
      tags: ["INBOUND", "HIGH_INTEREST", "SAMPLES"],
      whatsapp: true,
    },
    {
      d: 0,
      hour: 15,
      min: 30,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Patil Agencies",
      durationSec: 210,
      transcript: "Agreement clauses reviewed. Client agreed to minimum monthly commitment of ₹1 Lakh.",
      aiSummary: "Monthly quota agreed. Final agreement drafted.",
      tags: ["AGREEMENT", "QUOTA_AGREED"],
      whatsapp: false,
    },

    // Yesterday (Day 1)
    {
      d: 1,
      hour: 10,
      min: 30,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Vardhman Medical",
      durationSec: 260,
      transcript: "Introductory call on Pediatric line. Sent product rate list.",
      aiSummary: "Pediatric line visual aid dispatched.",
      tags: ["INTRO", "PEDIATRIC"],
      whatsapp: true,
    },
    {
      d: 1,
      hour: 11,
      min: 50,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Kothari Healthcare",
      durationSec: 310,
      transcript: "Rural distribution margin discussion. Offered 70% franchise discount.",
      aiSummary: "Margin discount finalized.",
      tags: ["MARGIN_DISCUSSION"],
      whatsapp: true,
    },
    {
      d: 1,
      hour: 14,
      min: 25,
      direction: "OUTBOUND",
      missed: true,
      targetName: "Sanjay Medical Stores",
      durationSec: 0,
      transcript: null,
      aiSummary: "No answer from party.",
      tags: ["MISSED_CALL"],
      whatsapp: false,
    },
    {
      d: 1,
      hour: 15,
      min: 40,
      direction: "INBOUND",
      missed: false,
      targetName: "Swastik Bio-Pharma",
      durationSec: 180,
      transcript: "Client confirmed receipt of first dispatch of 2,500 boxes. Satisfied with packaging.",
      aiSummary: "Dispatch confirmation and feedback call.",
      tags: ["DISPATCH_CONFIRMED", "HAPPY_CLIENT"],
      whatsapp: true,
    },
    {
      d: 1,
      hour: 17,
      min: 10,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Niramay Health",
      durationSec: 220,
      transcript: "Stockist inquiry. Discussed next replenishment cycle.",
      aiSummary: "Replenishment cycle set for 20th.",
      tags: ["CADENCE_SCHEDULED"],
      whatsapp: true,
    },

    // Day 2
    {
      d: 2,
      hour: 10,
      min: 15,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Shree Krishna Life Sciences",
      durationSec: 240,
      transcript: "Routine monthly order check. Reorder basket created.",
      aiSummary: "Reorder basket confirmed.",
      tags: ["REORDER"],
      whatsapp: true,
    },
    {
      d: 2,
      hour: 12,
      min: 0,
      direction: "OUTBOUND",
      missed: false,
      targetName: "Sai Krupa Pharma",
      durationSec: 190,
      transcript: "First call on IndiaMART lead.",
      aiSummary: "Initial contact established.",
      tags: ["INDIAMART_FIRST_TOUCH"],
      whatsapp: true,
    },
    {
      d: 2,
      hour: 15,
      min: 20,
      direction: "OUTBOUND",
      missed: true,
      targetName: "Om Life Sciences",
      durationSec: 0,
      transcript: null,
      aiSummary: "Unanswered.",
      tags: ["MISSED_CALL"],
      whatsapp: false,
    },
    {
      d: 2,
      hour: 16,
      min: 45,
      direction: "INBOUND",
      missed: false,
      targetName: "Patil Agencies",
      durationSec: 320,
      transcript: "Questions on GST input tax credit and transport freight terms.",
      aiSummary: "Commercial freight clarified. Door delivery agreed.",
      tags: ["FREIGHT_CLARIFIED"],
      whatsapp: true,
    },
  ];

  for (const c of amitCalls) {
    await prisma.call.create({
      data: {
        employeeId: amit.id,
        direction: c.direction,
        missed: c.missed,
        durationSec: c.durationSec,
        transcript: c.transcript,
        aiSummary: c.aiSummary,
        behaviorTags: c.tags,
        whatsappSent: c.whatsapp,
        occurredAt: daysAgo(c.d, c.hour, c.min),
      },
    });
  }

  console.log("Successfully seeded rich employee attendance, leads, calls, and clients!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
