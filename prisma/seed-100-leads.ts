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
  console.log("Seeding 100 leads assigned 2-3 days ago to Rahul Sharma (Employee A)...");

  // 1. Find Rahul Sharma
  const rahul = await prisma.employee.findFirst({
    where: { name: { contains: "Rahul", mode: "insensitive" } },
  });

  if (!rahul) {
    throw new Error("Rahul Sharma employee record not found");
  }

  const sources = ["META", "INDIAMART", "WEBSITE", "WHATSAPP", "SOCIAL", "MANUAL"] as const;
  const cities = [
    "Pune", "Nashik", "Nagpur", "Aurangabad", "Kolhapur", "Solapur", "Amravati",
    "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani",
    "Nanded", "Satara", "Wardha", "Beed", "Gondia", "Yavatmal", "Osmanabad"
  ];

  const businessTypes = [
    "PCD Pharma Franchise",
    "Monopoly Dealership",
    "Wholesale Medicine Agency",
    "Pharma Stockist & Distributor",
    "Retail Chemist Expansion",
    "Hospital Supply Partner",
    "Generic Medicine Depot",
  ];

  const drugs = [
    "Antibiotics (Amoxyclav, Cefixime, Azithromycin)",
    "Cardiac & Diabetic range (Telmisartan, Metformin)",
    "Pediatric syrups & drops",
    "Pain management & Orthopedic range (Aceclofenac, Diclofenac)",
    "Gastro & PPI range (Pantoprazole, Omeprazole)",
    "Nutritional supplements & Multivitamins",
    "Dermatology & Derma care lotions/ointments",
    "Ayurvedic & Herbal OTC syrups",
  ];

  const now = Date.now();
  const leadsToCreate = [];

  for (let i = 1; i <= 100; i++) {
    // 2 to 3.5 days ago
    const hoursAgo = 48 + Math.floor(Math.random() * 36); // between 48h (2d) and 84h (3.5d)
    const createdAt = new Date(now - hoursAgo * 60 * 60 * 1000);
    const city = cities[i % cities.length];
    const biz = businessTypes[i % businessTypes.length];
    const product = drugs[i % drugs.length];
    const source = sources[i % sources.length];
    const phone = `+91 ${9800000000 + (i * 37) % 99999999}`;

    const partyNames = [
      "Apex Healthcare", "BioMed Lifesciences", "Carewell Remedies", "Delta Pharma",
      "Evershine Medical", "Fortune Biotech", "Global Health Agencies", "Healing Touch Chemists",
      "Imperial Remedies", "Jupiter Pharma Distribution", "Kalyan Life Sciences", "Lotus Meditech",
      "Maruti Pharmaceuticals", "Navkar Healthcare", "Om Surgicals & Pharma", "Premier Lifecare",
      "Quantum Health Remedies", "Radhe Krishna Agencies", "Shree Ganesh Pharma", "Trinity Biotech",
      "Universal Medical Stores", "Vardhman Lifesciences", "Wellcare Pharma Agency", "Zenith Healthcare"
    ];
    const company = `${partyNames[i % partyNames.length]} (${city})`;

    // Status: mostly NEW / ASSIGNED with 0 calls (stagnant), plus some DEAD (marked rejected)
    const status = i % 10 === 0 ? "NOT_INTERESTED" : i % 3 === 0 ? "ASSIGNED" : "NEW";
    const inquiryDetails =
      status === "NOT_INTERESTED"
        ? `DEAD LEAD: Inquired for ${biz} in ${city} for ${product}. Rahul reported lead was unresponsive or asked for 60-day credit.`
        : `Allocated to Rahul ${Math.round(hoursAgo / 24)} days ago. Inquired for ${biz} monopoly in ${city}. Interested in ${product}. Zero follow-up calls logged yet.`;

    leadsToCreate.push({
      name: company,
      phoneNumber: phone,
      source,
      division: i % 4 === 0 ? "THIRD_PARTY" : "PCD_FRANCHISE",
      status: status as any,
      assignedEmployeeId: rahul.id,
      inquiryDetails,
      createdAt,
      reassignedCount: 0,
    });
  }

  // Insert in batch
  for (const lead of leadsToCreate) {
    await prisma.lead.create({
      data: lead,
    });
  }

  const finalRahulLeads = await prisma.lead.count({ where: { assignedEmployeeId: rahul.id } });
  console.log(`✅ Success! Rahul Sharma now has ${finalRahulLeads} leads assigned 2-3 days ago.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding leads:", err);
  process.exit(1);
});
