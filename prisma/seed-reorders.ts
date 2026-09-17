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
  console.log("Seeding billing system reorders, active clients, and product rate history...");

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. Ensure Territories
  const territoriesData = [
    { state: "Maharashtra", city: "Mumbai" },
    { state: "Maharashtra", city: "Pune" },
    { state: "Gujarat", city: "Ahmedabad" },
    { state: "Uttar Pradesh", city: "Lucknow" },
    { state: "Punjab", city: "Ludhiana" },
    { state: "Karnataka", city: "Bengaluru" },
  ];

  const territoryMap = new Map<string, string>();
  for (const t of territoriesData) {
    const territory = await prisma.territory.upsert({
      where: { state_city: { state: t.state, city: t.city } },
      update: {},
      create: t,
    });
    territoryMap.set(`${t.state}-${t.city}`, territory.id);
  }

  // 2. Ensure Regional Medical Representatives (Employees)
  const repsData = [
    { name: "Rahul Sharma", email: "rahul.sharma@pharma.internal", phone: "+91 98201 11221" },
    { name: "Priya Patel", email: "priya.patel@pharma.internal", phone: "+91 98791 33442" },
    { name: "Amit Verma", email: "amit.verma@pharma.internal", phone: "+91 98505 55663" },
    { name: "Neha Gupta", email: "neha.gupta@pharma.internal", phone: "+91 94150 77884" },
    { name: "Vikram Singh", email: "vikram.singh@pharma.internal", phone: "+91 98140 99005" },
    { name: "Suresh Reddy", email: "suresh.reddy@pharma.internal", phone: "+91 98450 22336" },
  ];

  const employeeMap = new Map<string, string>();
  for (const rep of repsData) {
    let user = await prisma.user.findUnique({ where: { email: rep.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: rep.email,
          passwordHash: "$2b$10$epdummyhashforfieldrep1234567890",
          role: "EMPLOYEE",
        },
      });
    }

    let emp = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!emp) {
      emp = await prisma.employee.create({
        data: {
          userId: user.id,
          name: rep.name,
          phoneNumber: rep.phone,
        },
      });
    }
    employeeMap.set(rep.name, emp.id);
  }

  // 3. Fetch products to map to order items
  const products = await prisma.product.findMany();
  const getProduct = (skuKeyword: string) =>
    products.find((p) => p.sku.toLowerCase().includes(skuKeyword.toLowerCase())) || products[0];

  // Key Products for reorder bundles
  const cefixime = getProduct("CEF") || products[0];
  const amoxy = getProduct("AMO") || products[1] || products[0];
  const azithro = getProduct("AZI") || products[2] || products[0];
  const panto = getProduct("PAN") || products[3] || products[0];
  const pcm = getProduct("PCM") || products[4] || products[0];
  const ceftri = getProduct("CFT") || products[5] || products[0];
  const syrup = getProduct("VIT") || getProduct("SYR") || products[6] || products[0];

  // 4. Detailed Active Clients with Reorder Cadences
  const activeClientsData = [
    {
      name: "Apex Health Remedies Pvt Ltd",
      companyDetails: "GSTIN: 27AABCA1234F1Z5 | DL: MH-MZ2-459102",
      phoneNumber: "+91 98201 44556",
      territoryStateCity: "Maharashtra-Mumbai",
      repName: "Rahul Sharma",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 28,
      typicalOrderDayOfMonth: 5,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Marg ERP 9+",
      reorderCycleDesc: "Monthly cadence (Typically 4th – 7th of every month)",
      orders: [
        {
          daysAgo: 84, // ~3 mos ago
          invoice: "MARG-INV-2026-3102",
          items: [
            { product: cefixime, qty: 300, rate: 42.5 },
            { product: azithro, qty: 200, rate: 68.0 },
            { product: panto, qty: 250, rate: 48.0 },
          ],
        },
        {
          daysAgo: 55, // ~2 mos ago
          invoice: "MARG-INV-2026-3814",
          items: [
            { product: cefixime, qty: 350, rate: 42.5 },
            { product: azithro, qty: 250, rate: 68.0 },
            { product: panto, qty: 300, rate: 48.0 },
          ],
        },
        {
          daysAgo: 26, // Last order: 26 days ago -> Next expected in 2 days (Due Now!)
          invoice: "MARG-INV-2026-4401",
          items: [
            { product: cefixime, qty: 400, rate: 42.5 },
            { product: azithro, qty: 250, rate: 68.0 },
            { product: panto, qty: 350, rate: 48.0 },
          ],
        },
      ],
    },
    {
      name: "MediLife Pharma Distributors",
      companyDetails: "GSTIN: 24AABCM7891K1Z2 | DL: GJ-AH1-884102",
      phoneNumber: "+91 98791 22334",
      territoryStateCity: "Gujarat-Ahmedabad",
      repName: "Priya Patel",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 30,
      typicalOrderDayOfMonth: 12,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Busy Accounting 21",
      reorderCycleDesc: "Monthly cadence (Typically 10th – 14th of every month)",
      orders: [
        {
          daysAgo: 70,
          invoice: "BUSY-INV-2026-7240",
          items: [
            { product: panto, qty: 450, rate: 46.0 },
            { product: syrup, qty: 350, rate: 38.5 },
            { product: amoxy, qty: 250, rate: 76.0 },
          ],
        },
        {
          daysAgo: 40,
          invoice: "BUSY-INV-2026-8109",
          items: [
            { product: panto, qty: 500, rate: 46.0 },
            { product: syrup, qty: 400, rate: 38.5 },
            { product: amoxy, qty: 300, rate: 76.0 },
          ],
        },
        {
          daysAgo: 10, // Last order: 10 days ago -> Healthy on-track
          invoice: "BUSY-INV-2026-8812",
          items: [
            { product: panto, qty: 500, rate: 46.0 },
            { product: syrup, qty: 400, rate: 38.5 },
            { product: amoxy, qty: 300, rate: 76.0 },
          ],
        },
      ],
    },
    {
      name: "Shree Krishna Life Sciences",
      companyDetails: "GSTIN: 27AABCS3344P1Z8 | DL: MH-PUN-992144",
      phoneNumber: "+91 98505 66778",
      territoryStateCity: "Maharashtra-Pune",
      repName: "Amit Verma",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 25,
      typicalOrderDayOfMonth: 2,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Marg ERP 9+",
      reorderCycleDesc: "Frequent 25-day cadence (Typically 1st – 3rd of month)",
      orders: [
        {
          daysAgo: 90,
          invoice: "MARG-INV-2026-2910",
          items: [
            { product: amoxy, qty: 350, rate: 76.0 },
            { product: cefixime, qty: 200, rate: 43.0 },
            { product: pcm, qty: 500, rate: 18.0 },
          ],
        },
        {
          daysAgo: 64,
          invoice: "MARG-INV-2026-3450",
          items: [
            { product: amoxy, qty: 400, rate: 76.0 },
            { product: cefixime, qty: 250, rate: 43.0 },
            { product: pcm, qty: 600, rate: 18.0 },
          ],
        },
        {
          daysAgo: 38, // Last order: 38 days ago -> OVERDUE / CHURN RISK!
          invoice: "MARG-INV-2026-3918",
          items: [
            { product: amoxy, qty: 400, rate: 76.0 },
            { product: cefixime, qty: 250, rate: 43.0 },
            { product: pcm, qty: 600, rate: 18.0 },
          ],
        },
      ],
    },
    {
      name: "Sunview Healthcare LLP",
      companyDetails: "GSTIN: 09AABCS8899R1Z4 | DL: UP-LKO-334411",
      phoneNumber: "+91 94150 99887",
      territoryStateCity: "Uttar Pradesh-Lucknow",
      repName: "Neha Gupta",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 30,
      typicalOrderDayOfMonth: 18,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Marg ERP 9+",
      reorderCycleDesc: "Monthly cadence (Typically 16th – 19th of every month)",
      orders: [
        {
          daysAgo: 88,
          invoice: "MARG-INV-2026-3022",
          items: [
            { product: pcm, qty: 700, rate: 17.5 },
            { product: syrup, qty: 450, rate: 32.0 },
            { product: azithro, qty: 200, rate: 68.0 },
          ],
        },
        {
          daysAgo: 58,
          invoice: "MARG-INV-2026-3780",
          items: [
            { product: pcm, qty: 800, rate: 17.5 },
            { product: syrup, qty: 500, rate: 32.0 },
            { product: azithro, qty: 250, rate: 68.0 },
          ],
        },
        {
          daysAgo: 28, // Last order: 28 days ago -> Next expected in 2 days (Due Now!)
          invoice: "MARG-INV-2026-4620",
          items: [
            { product: pcm, qty: 850, rate: 17.5 },
            { product: syrup, qty: 500, rate: 32.0 },
            { product: azithro, qty: 250, rate: 68.0 },
          ],
        },
      ],
    },
    {
      name: "Guru Nanak Medicos & Surgicals",
      companyDetails: "GSTIN: 03AABCG5566T1Z1 | DL: PB-LDH-772211",
      phoneNumber: "+91 98140 11223",
      territoryStateCity: "Punjab-Ludhiana",
      repName: "Vikram Singh",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 32,
      typicalOrderDayOfMonth: 24,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Busy Accounting 21",
      reorderCycleDesc: "Extended monthly cadence (Typically 22nd – 26th of month)",
      orders: [
        {
          daysAgo: 78,
          invoice: "BUSY-INV-2026-7490",
          items: [
            { product: ceftri, qty: 200, rate: 48.0 },
            { product: amoxy, qty: 300, rate: 76.0 },
            { product: pcm, qty: 800, rate: 18.0 },
          ],
        },
        {
          daysAgo: 46,
          invoice: "BUSY-INV-2026-8215",
          items: [
            { product: ceftri, qty: 250, rate: 48.0 },
            { product: amoxy, qty: 350, rate: 76.0 },
            { product: pcm, qty: 900, rate: 18.0 },
          ],
        },
        {
          daysAgo: 14, // Last order: 14 days ago -> Healthy
          invoice: "BUSY-INV-2026-9041",
          items: [
            { product: ceftri, qty: 250, rate: 48.0 },
            { product: amoxy, qty: 350, rate: 76.0 },
            { product: pcm, qty: 900, rate: 18.0 },
          ],
        },
      ],
    },
    {
      name: "Kaveri Bio-Pharma Agencies",
      companyDetails: "GSTIN: 29AABCK9901J1Z3 | DL: KA-BNG-882104",
      phoneNumber: "+91 98450 66771",
      territoryStateCity: "Karnataka-Bengaluru",
      repName: "Suresh Reddy",
      isRepeatCustomer: true,
      avgReorderIntervalDays: 28,
      typicalOrderDayOfMonth: 8,
      reorderAlertCadence: "MONTHLY",
      billingSource: "Marg ERP 9+",
      reorderCycleDesc: "Monthly cadence (Typically 7th – 10th of every month)",
      orders: [
        {
          daysAgo: 96,
          invoice: "MARG-INV-2026-2811",
          items: [
            { product: ceftri, qty: 200, rate: 48.0 },
            { product: cefixime, qty: 250, rate: 42.5 },
            { product: panto, qty: 300, rate: 48.0 },
          ],
        },
        {
          daysAgo: 68,
          invoice: "MARG-INV-2026-3502",
          items: [
            { product: ceftri, qty: 250, rate: 48.0 },
            { product: cefixime, qty: 300, rate: 42.5 },
            { product: panto, qty: 350, rate: 48.0 },
          ],
        },
        {
          daysAgo: 40, // Last order: 40 days ago -> OVERDUE / CHURN RISK!
          invoice: "MARG-INV-2026-4109",
          items: [
            { product: ceftri, qty: 250, rate: 48.0 },
            { product: cefixime, qty: 300, rate: 42.5 },
            { product: panto, qty: 350, rate: 48.0 },
          ],
        },
      ],
    },
  ];

  for (const clientData of activeClientsData) {
    const territoryId = territoryMap.get(clientData.territoryStateCity);
    const assignedEmployeeId = employeeMap.get(clientData.repName);

    let client = await prisma.client.findFirst({
      where: { name: clientData.name },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          name: clientData.name,
          companyDetails: clientData.companyDetails,
          phoneNumber: clientData.phoneNumber,
          territoryId,
          assignedEmployeeId,
          status: "ACTIVE",
          isRepeatCustomer: true,
          avgReorderIntervalDays: clientData.avgReorderIntervalDays,
          typicalOrderDayOfMonth: clientData.typicalOrderDayOfMonth,
          reorderAlertCadence: clientData.reorderAlertCadence,
        },
      });
    } else {
      client = await prisma.client.update({
        where: { id: client.id },
        data: {
          companyDetails: clientData.companyDetails,
          phoneNumber: clientData.phoneNumber,
          territoryId,
          assignedEmployeeId,
          status: "ACTIVE",
          isRepeatCustomer: true,
          avgReorderIntervalDays: clientData.avgReorderIntervalDays,
          typicalOrderDayOfMonth: clientData.typicalOrderDayOfMonth,
          reorderAlertCadence: clientData.reorderAlertCadence,
        },
      });
    }

    // Seed Orders with OrderItems
    for (const orderInfo of clientData.orders) {
      const orderTotal = orderInfo.items.reduce(
        (sum, item) => sum + item.qty * item.rate,
        0
      );

      // Check if order already exists with this invoiceNumber
      let order = await prisma.order.findFirst({
        where: { invoiceNumber: orderInfo.invoice },
      });

      if (!order) {
        order = await prisma.order.create({
          data: {
            clientId: client.id,
            amount: orderTotal,
            orderDate: daysAgo(orderInfo.daysAgo),
            invoiceNumber: orderInfo.invoice,
            billingSource: clientData.billingSource,
            orderStatus: "DELIVERED",
          },
        });

        // Create OrderItems
        for (const it of orderInfo.items) {
          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: it.product.id,
              quantity: it.qty,
              price: it.rate,
            },
          });
        }
      }
    }
  }

  console.log("Successfully seeded rich billing reorders, clients, and order items!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
