import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const encoded = encodeURIComponent("/*PL%&Zq8ecyj&Q");
const connectionString = `postgresql://postgres.uwsaspezgiauxxvmjdcv:${encoded}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Kesrox Healthcare into Supabase...");

  const companyId = "cmubi8zf6000004l8y45hhuds";
  const companyName = "Kesrox Healthcare";

  // 1. Company
  const company = await prisma.company.upsert({
    where: { id: companyId },
    update: { name: companyName, slug: "kesrox" },
    create: { id: companyId, name: companyName, slug: "kesrox" },
  });
  console.log("✓ Company:", company.name);

  // 2. CompanySettings
  const settings = await prisma.companySettings.create({
    data: {
      companyId: company.id,
      companyName: companyName,
      metaPageId: "112876304657266",
      metaWabaId: "1460433551636446",
      whatsappCompanionPhone: "+91 74948 09665",
      whatsappConnected: true,
      enableLeadCenter: true,
      enableLeadsAllotment: true,
      enableLeadsReassign: true,
      enableLeadsIq: true,
      enableSourcesHub: true,
      enableEmployeeTracking: true,
    },
  });
  console.log("✓ CompanySettings created with Meta Page ID & WhatsApp Companion Phone");

  // 3. Admin Users
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@kesrox.com" },
    update: { passwordHash, companyId: company.id },
    create: {
      email: "admin@kesrox.com",
      passwordHash,
      role: "ADMIN" as any,
      companyId: company.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "revixsolution@gmail.com" },
    update: { passwordHash, companyId: company.id },
    create: {
      email: "revixsolution@gmail.com",
      passwordHash,
      role: "ADMIN" as any,
      companyId: company.id,
    },
  });
  console.log("✓ Admin users ready: admin@kesrox.com & revixsolution@gmail.com (pwd: admin123)");

  // 4. Employee Savi
  const saviUser = await prisma.user.upsert({
    where: { email: "savi@kesrox.com" },
    update: { passwordHash, companyId: company.id },
    create: {
      email: "savi@kesrox.com",
      passwordHash,
      role: "EMPLOYEE" as any,
      companyId: company.id,
    },
  });

  const saviEmployee = await prisma.employee.upsert({
    where: { phoneNumber: "+91 78891 07964" },
    update: { name: "Savi", companyId: company.id },
    create: {
      name: "Savi",
      phoneNumber: "+91 78891 07964",
      userId: saviUser.id,
      companyId: company.id,
    },
  });
  console.log("✓ Employee Savi created:", saviEmployee.name, saviEmployee.phoneNumber);

  // 5. Seed all Meta Ad leads
  const leadsData = [
    { name: "NaveenKaarthik", phone: "+91 90474 69665", inquiry: "Third-Party Pharma Manufacturing quotation & product catalog" },
    { name: "Rajini Ganesh", phone: "+91 97879 28760", inquiry: "Inquiry regarding capsules and tablets third-party manufacturing batch sizes" },
    { name: "Haryana Prospect", phone: "+91 94661 46665", inquiry: "Interested in Kesrox product range and monopoly franchise" },
    { name: "Dr. Rajesh Sharma", phone: "+91 90314 29209", inquiry: "Third-Party Pharma Manufacturing inquiry from Meta Ad" },
    { name: "Sunil Kumar", phone: "+91 75990 59321", inquiry: "Meta Click-to-WhatsApp Ad lead for third-party mfg" },
    { name: "Vikram Mehta", phone: "+91 99533 63309", inquiry: "Hi Kesrox! Product list and monthly qty details" },
    { name: "Anand Verma", phone: "+91 95061 62274", inquiry: "Third-party manufacturing quotation request" },
    { name: "Praveen Rao", phone: "+91 94417 67501", inquiry: "Inquiry for injectable and syrup manufacturing" },
    { name: "Deepak Joshi", phone: "+91 89545 55600", inquiry: "Meta Ad Lead: PCD franchise and manufacturing requirements" },
    { name: "Ramesh Patel", phone: "+91 99186 39550", inquiry: "Tablets and capsules quotation" },
    { name: "Amitabh Sen", phone: "+91 99963 34378", inquiry: "Monthly batch quantities and WHO-GMP certificates" },
    { name: "Rohit Agarwal", phone: "+91 73619 82080", inquiry: "Price list and product catalogue requested" },
    { name: "Kishore Reddy", phone: "+91 63904 09445", inquiry: "Third party mfg contract inquiry" },
    { name: "Manoj Singh", phone: "+91 74800 62487", inquiry: "Hi Kesrox, interested in manufacturing quotation" },
    { name: "Gopal Krishna", phone: "+91 93456 04745", inquiry: "Inquiry for third-party pharma supply" },
    { name: "Suresh Gupta", phone: "+91 99966 19379", inquiry: "Contract manufacturing rates for tablets" },
  ];

  for (const l of leadsData) {
    await prisma.lead.create({
      data: {
        name: l.name,
        phoneNumber: l.phone,
        source: "META" as any,
        sourceTag: "Meta Click-to-WhatsApp Ad (Third-Party Mfg)",
        division: "THIRD_PARTY",
        status: "ASSIGNED" as any,
        companyId: company.id,
        assignedEmployeeId: saviEmployee.id,
        inquiryDetails: l.inquiry,
      },
    });
  }
  console.log(`✓ Seeded ${leadsData.length} active leads into Supabase!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
