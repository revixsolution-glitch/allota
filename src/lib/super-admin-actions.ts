"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import type { PlanTier, CompanyStatus } from "@/types/company";

export async function onboardCompany(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized. Super Admin access required.");
  }

  const name = formData.get("name") as string;
  let slug = formData.get("slug") as string;
  const contactEmail = formData.get("contactEmail") as string;
  const contactPhone = (formData.get("contactPhone") as string) || "";
  const planTier = (formData.get("planTier") as PlanTier) || "CORE_LEAD_SUITE";

  const adminName = formData.get("adminName") as string;
  const adminEmail = formData.get("adminEmail") as string;
  const adminPassword = formData.get("adminPassword") as string;

  if (!name || !contactEmail || !adminEmail || !adminPassword) {
    return { error: "Company name, contact email, admin email, and password are required." };
  }

  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Check uniqueness of slug and adminEmail
  const existingCompany = await prisma.company.findUnique({
    where: { slug },
  });
  if (existingCompany) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existingUser) {
    return { error: `A user with email ${adminEmail} already exists.` };
  }

  // Determine module toggles by plan tier
  const isPremium = planTier === "PREMIUM_ERP";
  const enableStockIq = formData.get("enableStockIq") === "true" || isPremium;
  const enableTerritories = formData.get("enableTerritories") === "true" || isPremium;
  const enableClients = formData.get("enableClientsManagement") === "true" || isPremium;
  const enableReorders = formData.get("enableReorders") === "true" || isPremium;
  const enableCredits = formData.get("enableCreditManagement") === "true" || isPremium;

  // Cloud Storage & Third-Party APIs (Optional)
  const driveFolderUrl = (formData.get("driveFolderUrl") as string)?.trim() || null;
  const indiaMartApiKey = (formData.get("indiaMartApiKey") as string)?.trim() || null;
  const billingSoftwareApiKey = (formData.get("billingSoftwareApiKey") as string)?.trim() || null;
  const metaApiKey = (formData.get("metaApiKey") as string)?.trim() || null;
  const pharmaHopperApiKey = (formData.get("pharmaHopperApiKey") as string)?.trim() || null;
  const pharmaVentApiKey = (formData.get("pharmaVentApiKey") as string)?.trim() || null;

  // Transaction to create Company, CompanySettings, and initial Admin User
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name,
        slug,
        contactEmail,
        contactPhone,
        status: "ACTIVE",
        planTier,
      },
    });

    await tx.companySettings.create({
      data: {
        companyId: company.id,
        enableBillingErp: isPremium,
        enableStockIq,
        enableTerritories,
        enableClientsManagement: enableClients,
        enableReorders,
        enableCreditManagement: enableCredits,
        driveFolderUrl,
        indiaMartApiKey,
        billingSoftwareApiKey,
        metaApiKey,
        pharmaHopperApiKey,
        pharmaVentApiKey,
      },
    });

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const adminUser = await tx.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
        companyId: company.id,
      },
    });

    return { company, adminUser };
  });

  revalidatePath("/super-admin");
  return {
    success: true,
    companyId: result.company.id,
    companyName: result.company.name,
    adminEmail: result.adminUser.email,
  };
}

export async function updateCompanyStatus(companyId: string, status: CompanyStatus) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized.");
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { status },
  });

  revalidatePath("/super-admin");
  return { success: true };
}

export async function updateCompanyPlanTier(companyId: string, planTier: PlanTier) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized.");
  }

  const isPremium = planTier === "PREMIUM_ERP";

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: { planTier },
    });

    // Update settings flags
    await tx.companySettings.updateMany({
      where: { companyId },
      data: {
        enableBillingErp: isPremium,
        enableStockIq: isPremium,
        enableTerritories: isPremium,
        enableClientsManagement: isPremium,
        enableReorders: isPremium,
        enableCreditManagement: isPremium,
      },
    });
  });

  revalidatePath("/super-admin");
  revalidatePath("/admin");
  return { success: true };
}
