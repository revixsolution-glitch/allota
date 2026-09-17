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
  console.log("Seeding database with realistic pharma clients & credit records...");

  // 1. Territories
  const territoriesData = [
    { state: "Maharashtra", city: "Mumbai" },
    { state: "Maharashtra", city: "Pune" },
    { state: "Gujarat", city: "Ahmedabad" },
    { state: "Uttar Pradesh", city: "Lucknow" },
    { state: "Punjab", city: "Ludhiana" },
    { state: "Karnataka", city: "Bengaluru" },
  ];

  const territories = [];
  for (const t of territoriesData) {
    const territory = await prisma.territory.upsert({
      where: { state_city: { state: t.state, city: t.city } },
      update: {},
      create: t,
    });
    territories.push(territory);
  }

  // Get employee
  const employee = await prisma.employee.findFirst();

  // 2. Clients
  const clientsData = [
    {
      name: "Apex Health Remedies Pvt Ltd",
      phoneNumber: "+91 98201 44556",
      companyDetails: "GSTIN: 27AABCA1234F1Z5, DL: MH-MZ2-459102",
      territoryId: territories.find((t) => t.city === "Mumbai")?.id,
      assignedEmployeeId: employee?.id,
      isRepeatCustomer: true,
      status: "ACTIVE" as const,
    },
    {
      name: "MediLife Pharma Distributors",
      phoneNumber: "+91 98791 22334",
      companyDetails: "GSTIN: 24AABCM7891K1Z2, DL: GJ-AH1-884102",
      territoryId: territories.find((t) => t.city === "Ahmedabad")?.id,
      assignedEmployeeId: employee?.id,
      isRepeatCustomer: true,
      status: "ACTIVE" as const,
    },
    {
      name: "Shree Krishna Life Sciences",
      phoneNumber: "+91 98505 66778",
      companyDetails: "GSTIN: 27AABCS3344P1Z8, DL: MH-PUN-992144",
      territoryId: territories.find((t) => t.city === "Pune")?.id,
      assignedEmployeeId: employee?.id,
      isRepeatCustomer: false,
      status: "ACTIVE" as const,
    },
    {
      name: "Sunview Healthcare LLP",
      phoneNumber: "+91 94150 99887",
      companyDetails: "GSTIN: 09AABCS8899R1Z4, DL: UP-LKO-334411",
      territoryId: territories.find((t) => t.city === "Lucknow")?.id,
      assignedEmployeeId: employee?.id,
      isRepeatCustomer: true,
      status: "ACTIVE" as const,
    },
    {
      name: "Guru Nanak Medicos & Surgicals",
      phoneNumber: "+91 98140 11223",
      companyDetails: "GSTIN: 03AABCG5566T1Z1, DL: PB-LDH-772211",
      territoryId: territories.find((t) => t.city === "Ludhiana")?.id,
      assignedEmployeeId: employee?.id,
      isRepeatCustomer: true,
      status: "ACTIVE" as const,
    },
  ];

  const clientMap = new Map();
  for (const c of clientsData) {
    let client = await prisma.client.findFirst({ where: { name: c.name } });
    if (!client) {
      client = await prisma.client.create({ data: c });
    }
    clientMap.set(c.name, client);
  }

  // 3. Products
  const productsData = [
    { name: "Cefixime 200mg DT (10x10)", sku: "CEF-200-TAB", stockQty: 1450, reorderThreshold: 500 },
    { name: "Pantoprazole 40mg + Domperidone 30mg DSR", sku: "PAN-DSR-CAP", stockQty: 820, reorderThreshold: 400 },
    { name: "Azithromycin 500mg Tablets", sku: "AZI-500-TAB", stockQty: 320, reorderThreshold: 350 },
    { name: "Amoxycillin + Clavulanic Acid 625mg", sku: "AMO-625-TAB", stockQty: 290, reorderThreshold: 300 },
    { name: "Paracetamol 650mg Infusion/Tabs", sku: "PCM-650-TAB", stockQty: 3200, reorderThreshold: 1000 },
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: { stockQty: p.stockQty, reorderThreshold: p.reorderThreshold },
      create: p,
    });
  }

  // 4. Credit Records with diverse "Days Asked" & due proximity
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const apex = clientMap.get("Apex Health Remedies Pvt Ltd");
  const medilife = clientMap.get("MediLife Pharma Distributors");
  const shreeKrishna = clientMap.get("Shree Krishna Life Sciences");
  const sunview = clientMap.get("Sunview Healthcare LLP");
  const guruNanak = clientMap.get("Guru Nanak Medicos & Surgicals");

  const credits = [
    {
      clientId: apex.id,
      invoiceNumber: "INV-2026-CR01",
      productDetails: "Cefixime 200mg (600 boxes), Azithromycin 500mg (400 strips)",
      totalAmount: 185000,
      paidAmount: 60000,
      balanceAmount: 125000,
      daysAsked: 30, // Asked for 30 days credit
      invoiceDate: daysAgo(28),
      dueDate: daysFromNow(2), // 2 days left -> NEARBY_DUE
      status: "NEARBY_DUE" as const,
      sendAiMessage: true,
      aiMessageStatus: "QUEUED_ALERT_2D",
      aiMessagePreview: "Apex Health Remedies: Reminder that ₹1,25,000 against 30-day credit (Inv #INV-2026-CR01) matures in 2 days. AI automated dispatch.",
      enableAiCall: true,
      aiCallStatus: "SCHEDULED" as const,
      aiCallSummary: "AI call scheduled for tomorrow 11:00 AM via Voicebot to verify RTGS transfer.",
      notes: "High volume distributor. Requested 30 days credit on seasonal antibiotics.",
    },
    {
      clientId: medilife.id,
      invoiceNumber: "INV-2026-CR02",
      productDetails: "Pantoprazole DSR (800 boxes), Multivitamin Syrup (300 bottles)",
      totalAmount: 240000,
      paidAmount: 0,
      balanceAmount: 240000,
      daysAsked: 45, // Asked for 45 days credit
      invoiceDate: daysAgo(15),
      dueDate: daysFromNow(30), // 30 days left -> CURRENT
      status: "CURRENT" as const,
      sendAiMessage: true,
      aiMessageStatus: "PENDING_SCHEDULE",
      enableAiCall: true,
      aiCallStatus: "IDLE" as const,
      notes: "Quarterly stock purchase. 45 days credit terms agreed.",
    },
    {
      clientId: shreeKrishna.id,
      invoiceNumber: "INV-2026-CR03",
      productDetails: "Amoxyclav 625mg (500 boxes), Cough Syrup 100ml (450 bottles)",
      totalAmount: 160000,
      paidAmount: 40000,
      balanceAmount: 120000,
      daysAsked: 15, // Asked for 15 days credit
      invoiceDate: daysAgo(22),
      dueDate: daysAgo(7), // 7 days past due -> OVERDUE
      status: "OVERDUE" as const,
      sendAiMessage: true,
      aiMessageStatus: "OVERDUE_ALERT_SENT",
      lastAiMessageAt: daysAgo(1),
      aiMessagePreview: "URGENT: Shree Krishna Life Sciences payment of ₹1,20,000 is 7 days overdue. Immediate RTGS required to release next dispatch.",
      enableAiCall: true,
      aiCallStatus: "PROMISED_TO_PAY" as const,
      lastAiCallAt: daysAgo(1),
      aiCallSummary: "AI Agent connected with Dr. Rajesh. Client acknowledged overdue invoice. Committed NEFT payment by Sept 16, 2:00 PM.",
      notes: "First time taking 15 days credit. Delay due to hospital reimbursement.",
    },
    {
      clientId: guruNanak.id,
      invoiceNumber: "INV-2026-CR04",
      productDetails: "Levocetirizine 5mg (750 strips), Calcium D3 (400 tabs)",
      totalAmount: 210000,
      paidAmount: 50000,
      balanceAmount: 160000,
      daysAsked: 60, // Asked for 60 days credit
      invoiceDate: daysAgo(57),
      dueDate: daysFromNow(3), // 3 days left -> NEARBY_DUE
      status: "NEARBY_DUE" as const,
      sendAiMessage: true,
      aiMessageStatus: "QUEUED_ALERT_3D",
      aiMessagePreview: "Guru Nanak Medicos: Friendly reminder that ₹1,60,000 for your 60-day credit period is due in 3 days. Thank you for your partnership.",
      enableAiCall: true,
      aiCallStatus: "SCHEDULED" as const,
      notes: "Longstanding Ludhiana franchise partner on 60 days credit cycle.",
    },
    {
      clientId: sunview.id,
      invoiceNumber: "INV-2026-CR05",
      productDetails: "Paracetamol 650 (1200 strips), Vitamin C (500 boxes)",
      totalAmount: 95000,
      paidAmount: 95000,
      balanceAmount: 0,
      daysAsked: 15, // Asked for 15 days credit
      invoiceDate: daysAgo(30),
      dueDate: daysAgo(15),
      status: "SETTLED" as const,
      sendAiMessage: false,
      aiMessageStatus: "SETTLED_NO_ACTION",
      enableAiCall: false,
      aiCallStatus: "COMPLETED" as const,
      aiCallSummary: "Previous AI reminder was sent. Client cleared ₹95,000 via IMPS on due date.",
      notes: "Cleared in full on time.",
    },
  ];

  for (const cr of credits) {
    await prisma.creditRecord.upsert({
      where: { invoiceNumber: cr.invoiceNumber },
      update: cr,
      create: cr,
    });
  }

  // Also add sample orders so total sales stats reflect
  for (const cr of credits) {
    const existingOrder = await prisma.order.findFirst({
      where: { clientId: cr.clientId, amount: cr.totalAmount },
    });
    if (!existingOrder) {
      await prisma.order.create({
        data: {
          clientId: cr.clientId,
          amount: cr.totalAmount,
          orderDate: cr.invoiceDate,
        },
      });
    }
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
