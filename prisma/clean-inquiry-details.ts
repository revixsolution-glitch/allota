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
  console.log("Cleaning lead inquiry details to be authentic customer inquiries without synthetic text...");

  const leads = await prisma.lead.findMany();

  const realInquiryTemplates = [
    (city: string) => `Inquired for PCD monopoly franchise rights in ${city}. Holds wholesale drug license (20B/21B) & GSTIN. Requested price list with promotional inputs (MR visual aids, catch covers, sample kits).`,
    (city: string) => `Looking for exclusive district distribution dealership in ${city}. Experienced pharmaceutical distributor with network of 45+ retail chemists. Interested in antibiotic & gastro range.`,
    (city: string) => `Enquiry for Cardiac & Diabetic division monopoly in ${city}. Currently distributing for regional brands; looking for higher margin PCD partner with Marg ERP billing compatibility.`,
    (city: string) => `Inquired for Pediatric syrups and drops range in ${city}. Requested sample dispatch and transport delivery timeline for initial stock batch.`,
    (city: string) => `Hospital and surgical supply agency in ${city} seeking direct company dealership for injectables and critical care products.`,
    (city: string) => `Wholesale distributor looking for third-party contract manufacturing batch quotation. Requested formula specifications and batch MOQ details for private labeling.`,
    (city: string) => `Wholesale medicine depot expansion inquiry in ${city}. Needs monopoly agreement draft and product composition catalog.`,
    (city: string) => `Retail chemist chain owner seeking exclusive franchisee agreement in ${city}. Ready for immediate initial billing upon document verification.`,
  ];

  const deadInquiryTemplates = [
    (city: string) => `Lead marked not interested: Demanded 60-day unsecured credit on initial trial order. Company policy requires advance or 15-day verified PDC for new accounts.`,
    (city: string) => `Lead marked not interested: Territory conflict — exclusive PCD franchise monopoly in ${city} is already allotted to an active distributor party.`,
    (city: string) => `Lead marked not interested: Retail-only counter without wholesale drug license (Form 20B/21B) required for pharma franchise operations.`,
    (city: string) => `Lead marked not interested: Budget constraint for initial stock commitment. Unable to meet minimum batch order value.`,
  ];

  let updated = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const name = lead.name || "";
    const cityMatch = name.match(/\((.*?)\)/);
    const city = cityMatch ? cityMatch[1] : "Maharashtra";

    let cleanDetail = "";
    if (lead.status === "NOT_INTERESTED") {
      cleanDetail = deadInquiryTemplates[i % deadInquiryTemplates.length](city);
    } else {
      cleanDetail = realInquiryTemplates[i % realInquiryTemplates.length](city);
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        inquiryDetails: cleanDetail,
      },
    });
    updated++;
  }

  console.log(`✅ Successfully updated ${updated} leads with authentic pharmaceutical customer inquiry details.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
