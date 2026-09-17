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
  console.log("Seeding comprehensive PCD Franchise and Third-Party Manufacturing data...");

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // 1. Tag existing clients as PCD_FRANCHISE
  await prisma.client.updateMany({
    where: {},
    data: {
      businessType: "PCD_FRANCHISE",
    },
  });

  // 2. Ensure representatives
  const reps = await prisma.employee.findMany();
  const rep1 = reps[0]?.id;
  const rep2 = reps[1]?.id || rep1;

  // 3. Create 3 Major Third-Party / Contract Manufacturing Parties
  const thirdPartyClients = [
    {
      name: "Zenith Bioceuticals Pvt Ltd (Contract Brand)",
      companyDetails: "GSTIN: 27AAACZ8901L1Z9 | Loan License: MH-LL-330129",
      phoneNumber: "+91 98200 77112",
      businessType: "THIRD_PARTY",
      status: "ACTIVE" as const,
      isRepeatCustomer: true,
      avgReorderIntervalDays: 45,
      typicalOrderDayOfMonth: 15,
      reorderAlertCadence: "BI_MONTHLY",
    },
    {
      name: "Aura Meditech Formulations",
      companyDetails: "GSTIN: 24AABCA5544R1Z1 | Loan License: GJ-LL-992144",
      phoneNumber: "+91 98790 44556",
      businessType: "THIRD_PARTY",
      status: "ACTIVE" as const,
      isRepeatCustomer: true,
      avgReorderIntervalDays: 40,
      typicalOrderDayOfMonth: 20,
      reorderAlertCadence: "MONTHLY",
    },
    {
      name: "Medisurge Healthcare Brands",
      companyDetails: "GSTIN: 03AABCM1122D1Z6 | Loan License: PB-LL-883311",
      phoneNumber: "+91 98140 33221",
      businessType: "THIRD_PARTY",
      status: "ACTIVE" as const,
      isRepeatCustomer: true,
      avgReorderIntervalDays: 60,
      typicalOrderDayOfMonth: 10,
      reorderAlertCadence: "BI_MONTHLY",
    },
  ];

  const products = await prisma.product.findMany();
  const pcm = products.find((p) => p.sku.includes("PCM")) || products[0];
  const panto = products.find((p) => p.sku.includes("PAN")) || products[1];
  const cef = products.find((p) => p.sku.includes("CEF")) || products[2];
  const ceftri = products.find((p) => p.sku.includes("CFT")) || products[3] || products[0];

  for (const tpc of thirdPartyClients) {
    let client = await prisma.client.findFirst({ where: { name: tpc.name } });
    if (!client) {
      client = await prisma.client.create({
        data: {
          ...tpc,
          assignedEmployeeId: rep1,
        },
      });
    } else {
      client = await prisma.client.update({
        where: { id: client.id },
        data: {
          businessType: "THIRD_PARTY",
        },
      });
    }

    // Add Third-Party Manufacturing Bulk Batch Orders
    const tpOrders = [
      {
        invoice: `TP-BATCH-${Date.now().toString().slice(-4)}-A`,
        daysAgo: 25,
        billingSource: "Marg ERP 9+",
        items: [
          { product: pcm, qty: 3500, rate: 16.5 }, // 3,500 boxes contract batch
          { product: panto, qty: 2000, rate: 42.0 },
        ],
      },
      {
        invoice: `TP-BATCH-${Date.now().toString().slice(-4)}-B`,
        daysAgo: 70,
        billingSource: "Busy Accounting 21",
        items: [
          { product: cef, qty: 1500, rate: 39.0 },
          { product: ceftri, qty: 1200, rate: 44.0 },
        ],
      },
    ];

    for (const ord of tpOrders) {
      const orderTotal = ord.items.reduce((s, it) => s + it.qty * it.rate, 0);
      const existing = await prisma.order.findFirst({ where: { invoiceNumber: ord.invoice } });
      if (!existing) {
        const order = await prisma.order.create({
          data: {
            clientId: client.id,
            amount: orderTotal,
            orderDate: daysAgo(ord.daysAgo),
            invoiceNumber: ord.invoice,
            billingSource: ord.billingSource,
            orderStatus: "DELIVERED",
          },
        });

        for (const it of ord.items) {
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

  // 4. Seed Rich Leads / Queries (PCD Franchise vs Third-Party Manufacturing)
  const leadsData = [
    // PCD Franchise Inquiries
    {
      name: "Dr. Alok Srivastava",
      phoneNumber: "+91 94151 88223",
      source: "INDIAMART" as const,
      division: "PCD_FRANCHISE",
      status: "CONVERTED" as const,
      inquiryDetails: "Exclusive PCD Monopoly rights for Gorakhpur & Basti district (UP). Investment budget ₹3.5L.",
    },
    {
      name: "Sharma Medicos & Healthcare",
      phoneNumber: "+91 98290 11445",
      source: "META" as const,
      division: "PCD_FRANCHISE",
      status: "INTERESTED" as const,
      inquiryDetails: "Looking for cardiac & diabetic franchise for Jaipur & Sikar. Requested visual aids & price list.",
    },
    {
      name: "M/S Kalinga Life Sciences",
      phoneNumber: "+91 94370 66778",
      source: "WEBSITE" as const,
      division: "PCD_FRANCHISE",
      status: "CONTACTED" as const,
      inquiryDetails: "General range PCD franchise for Cuttack & Bhubaneswar. Has wholesale drug license.",
    },
    {
      name: "Tirupati Pharma Distributors",
      phoneNumber: "+91 98480 33445",
      source: "WHATSAPP" as const,
      division: "PCD_FRANCHISE",
      status: "ASSIGNED" as const,
      inquiryDetails: "Inquired via WhatsApp for Vijayawada monopoly. Representative dispatched sample brochure.",
    },
    {
      name: "Bhopal Medi-Corp Agency",
      phoneNumber: "+91 98260 55667",
      source: "INDIAMART" as const,
      division: "PCD_FRANCHISE",
      status: "NEW" as const,
      inquiryDetails: "IndiaMART BuyLead: Antibiotics & Pediatric PCD franchise for Bhopal district.",
    },
    {
      name: "Nalanda Health Remedies",
      phoneNumber: "+91 93340 77889",
      source: "META" as const,
      division: "PCD_FRANCHISE",
      status: "NEW" as const,
      inquiryDetails: "Meta Instant Lead Form: PCD Pharma dealership in Patna & Gaya. Budget ₹2 Lakhs.",
    },

    // Third-Party / Contract Manufacturing Inquiries
    {
      name: "Nexgen Pharmaceuticals Ltd",
      phoneNumber: "+91 98110 99887",
      source: "INDIAMART" as const,
      division: "THIRD_PARTY",
      status: "INTERESTED" as const,
      inquiryDetails: "Contract manufacturing of 100,000 tablets Paracetamol 650mg & 50,000 Pan-DSR capsules under private label.",
    },
    {
      name: "CareWell Remedies Pvt Ltd",
      phoneNumber: "+91 98200 44332",
      source: "WEBSITE" as const,
      division: "THIRD_PARTY",
      status: "CONTACTED" as const,
      inquiryDetails: "Third-party manufacturing for Injectables line (Ceftriaxone 1g, Methylcobalamin). Has own brand approvals.",
    },
    {
      name: "Novacure Life Sciences",
      phoneNumber: "+91 98790 66554",
      source: "INDIAMART" as const,
      division: "THIRD_PARTY",
      status: "CONVERTED" as const,
      inquiryDetails: "Contract manufacturing quotation approved. 3 batches commercialized via Marg ERP billing.",
    },
    {
      name: "Stallion Biotech Brands",
      phoneNumber: "+91 94140 22331",
      source: "MANUAL" as const,
      division: "THIRD_PARTY",
      status: "NEW" as const,
      inquiryDetails: "Third-party syrup & suspension contract manufacturing quote requested for 10,000 bottles.",
    },
  ];

  for (const ld of leadsData) {
    const existing = await prisma.lead.findFirst({
      where: { phoneNumber: ld.phoneNumber },
    });
    if (!existing) {
      await prisma.lead.create({
        data: {
          ...ld,
          assignedEmployeeId: rep1,
        },
      });
    } else {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          division: ld.division,
          inquiryDetails: ld.inquiryDetails,
        },
      });
    }
  }

  console.log("Successfully seeded rich PCD Franchise & Third-Party Manufacturing data!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
