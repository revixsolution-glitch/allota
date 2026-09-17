import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting multi-tenant database migration...");

  // 1. Create Default Primary Company (Pharma Life Sciences Pvt Ltd)
  const defaultCompany = await prisma.company.upsert({
    where: { slug: "pharma-life" },
    update: {
      name: "Pharma Life Sciences Pvt Ltd",
      contactEmail: "contact@pharmalifesciences.com",
      contactPhone: "+91 98200 12345",
      status: "ACTIVE",
      planTier: "CORE_LEAD_SUITE",
    },
    create: {
      name: "Pharma Life Sciences Pvt Ltd",
      slug: "pharma-life",
      contactEmail: "contact@pharmalifesciences.com",
      contactPhone: "+91 98200 12345",
      status: "ACTIVE",
      planTier: "CORE_LEAD_SUITE",
    },
  });

  console.log(`Created/Verified Default Company: ${defaultCompany.name} (ID: ${defaultCompany.id})`);

  // 2. Link Default CompanySettings to Company
  await prisma.companySettings.updateMany({
    where: { OR: [{ id: "default" }, { companyId: null }] },
    data: { companyId: defaultCompany.id },
  });

  // 3. Associate all existing unassigned records to this primary company
  const [uRes, eRes, tRes, cRes, lRes, pRes, oRes] = await Promise.all([
    prisma.user.updateMany({
      where: { companyId: null, role: { not: "SUPER_ADMIN" } },
      data: { companyId: defaultCompany.id },
    }),
    prisma.employee.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
    prisma.territory.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
    prisma.client.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
    prisma.lead.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
    prisma.product.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
    prisma.order.updateMany({
      where: { companyId: null },
      data: { companyId: defaultCompany.id },
    }),
  ]);

  console.log(`Migrated entities to company:
  - Users: ${uRes.count}
  - Employees: ${eRes.count}
  - Territories: ${tRes.count}
  - Clients: ${cRes.count}
  - Leads: ${lRes.count}
  - Products: ${pRes.count}
  - Orders: ${oRes.count}`);

  // 4. Create / Upsert Global Super Admin Account
  const superAdminPasswordHash = await bcrypt.hash("superadmin123", 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@pharmacrm.com" },
    update: {
      passwordHash: superAdminPasswordHash,
      role: "SUPER_ADMIN",
      companyId: null, // Super Admin is global
    },
    create: {
      id: "super_admin_global",
      email: "superadmin@pharmacrm.com",
      passwordHash: superAdminPasswordHash,
      role: "SUPER_ADMIN",
      companyId: null,
    },
  });

  console.log(`Created/Verified Super Admin: ${superAdmin.email} (Password: superadmin123)`);
  console.log("Migration complete! Database is now multi-tenant ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
