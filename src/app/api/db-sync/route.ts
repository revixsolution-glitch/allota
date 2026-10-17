import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Role, LeadSource, LeadStatus, ClientStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function GET() {
  // Maintenance/seed script: platform super admin only. It must never be reachable anonymously.
  const session = await getSession();
  if (!session || session.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureCompanySettingsColumns();

    const driveUrl = "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3";

    // 1. Assign orphan records with companyId: null to the demo company (Pharma Life) so new tenants never see dummy data
    const pharmaLifeCompany = await prisma.company.findFirst({
      where: { slug: "pharma-life" },
    });
    if (pharmaLifeCompany) {
      await prisma.employee.updateMany({
        where: { companyId: null },
        data: { companyId: pharmaLifeCompany.id },
      });
      await prisma.lead.updateMany({
        where: { companyId: null },
        data: { companyId: pharmaLifeCompany.id },
      });
      await prisma.client.updateMany({
        where: { companyId: null },
        data: { companyId: pharmaLifeCompany.id },
      });
      await prisma.territory.updateMany({
        where: { companyId: null },
        data: { companyId: pharmaLifeCompany.id },
      });
      await prisma.product.updateMany({
        where: { companyId: null },
        data: { companyId: pharmaLifeCompany.id },
      });
      await prisma.companySettings.updateMany({
        where: {
          OR: [{ id: "default" }, { companyId: pharmaLifeCompany.id }],
        },
        data: { driveFolderUrl: driveUrl, companyId: pharmaLifeCompany.id },
      });
    }

    // 0. Clean leads that have wrong names (division terms used as names or failed imports)
    const wrongLeadsCondition = {
      OR: [
        { name: { contains: "PCD Pharma Franchise", mode: "insensitive" as const } },
        { name: { contains: "PCD Franchise", mode: "insensitive" as const } },
        { name: { contains: "Third-Party Manufacturing", mode: "insensitive" as const } },
        { name: { contains: "Third Party Manufacturing", mode: "insensitive" as const } },
        { name: { contains: "Pharma Franchise", mode: "insensitive" as const } },
        { name: { equals: "PCD", mode: "insensitive" as const } },
        { name: { equals: "PCD Pharma", mode: "insensitive" as const } },
        { name: { equals: "Third Party", mode: "insensitive" as const } },
        { name: { equals: "Contract Manufacturing", mode: "insensitive" as const } },
        { name: { equals: "Contract Mfg", mode: "insensitive" as const } },
        {
          AND: [
            { source: LeadSource.EXCEL_IMPORT },
            { name: { startsWith: "Prospect" } },
          ],
        },
      ],
    };

    const wrongLeadsToDelete = await prisma.lead.findMany({
      where: wrongLeadsCondition,
      select: { id: true, name: true, phoneNumber: true },
    });

    const deletedWrongLeads = await prisma.lead.deleteMany({
      where: wrongLeadsCondition,
    });

    // Also clean any previous Excel import runs for Kesrox so the user gets a 100% clean slate to re-upload
    const deletedKesroxExcelLeads = await prisma.lead.deleteMany({
      where: {
        company: {
          OR: [
            { slug: "Kesrox-Pharmaceuticals" },
            { slug: "kesrox-pharma" },
            { contactEmail: "kesroxpharmaceuticals@gmail.com" },
          ],
        },
        source: LeadSource.EXCEL_IMPORT,
        name: { not: "Amanjot Kaur (Patiala Medicos)" },
      },
    });

    // Clean any test batch runs
    await prisma.lead.deleteMany({
      where: { sourceTag: { in: ["Test Batch 19", "Test 19 Rows"] } },
    });

    // Restore real company names
    await prisma.company.updateMany({
      where: { slug: "pharma-life" },
      data: { name: "Pharma Life Sciences" },
    });
    await prisma.company.updateMany({
      where: { slug: "zydus-healthcare" },
      data: { name: "Zydus Healthcare" },
    });
    await prisma.company.updateMany({
      where: {
        OR: [
          { slug: "Kesrox-Pharmaceuticals" },
          { slug: "kesrox-pharma" },
          { contactEmail: "kesroxpharmaceuticals@gmail.com" },
        ],
      },
      data: { name: "Kesrox Pharmaceuticals" },
    });

    // 2. Find and configure the manually onboarded Kesrox Company
    let manualKesrox = await prisma.company.findFirst({
      where: {
        OR: [
          { slug: "Kesrox-Pharmaceuticals" },
          { contactEmail: "kesroxpharmaceuticals@gmail.com" },
        ],
      },
      include: {
        settings: true,
        users: { select: { id: true, email: true, role: true } },
        employees: true,
      },
    });

    const kesroxSettingsData = {
      companyName: "Kesrox Pharmaceuticals",
      planTier: "CORE_LEAD_SUITE",
      enableBillingErp: false,
      enableStockIq: false,
      enableReorders: false,
      enableCreditManagement: false,
      enableClientsManagement: false,
      enableTerritories: false,
      billingSoftwareApiKey: null,
      driveFolderUrl: "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3", 
      metaAppId: "1422721583164519",  
      metaPageId: "112876304657266",
      metaWabaId: "1460433551636446",
      metaPhoneNumberId: "739027919285346",
      metaAdAccountId: "act_1307420369741671",
      enableAdsInsights: true,
      enableSocialInbox: true,
      enableLeadCenter: true,
      enableLeadsAllotment: true,
    };

    let company;

    if (manualKesrox) {
      await prisma.company.update({
        where: { id: manualKesrox.id },
        data: { name: "Kesrox Pharmaceuticals", planTier: "CORE_LEAD_SUITE" },
      });

      const existingSettings = await prisma.companySettings.findFirst({
        where: { companyId: manualKesrox.id },
      });

      if (existingSettings) {
        await prisma.companySettings.update({
          where: { id: existingSettings.id },
          data: {
            ...kesroxSettingsData,
            companyId: manualKesrox.id,
          },
        });
      } else {
        await prisma.companySettings.create({
          data: {
            ...kesroxSettingsData,
            companyId: manualKesrox.id,
          },
        });
      }

      await prisma.tenantDatabase.upsert({
        where: { companyId: manualKesrox.id },
        update: {
          metaPageId: "112876304657266",
          metaWabaId: "1460433551636446",
        },
        create: {
          companyId: manualKesrox.id,
          connectionString: process.env.DATABASE_URL || "",
          metaPageId: "112876304657266",
          metaWabaId: "1460433551636446",
        },
      }).catch((e) => console.warn("TenantDatabase upsert notice:", e?.message));

      // If an old demo company "kesrox-pharma" exists separately, migrate and cleanup to keep single Kesrox
      const demoKesrox = await prisma.company.findUnique({
        where: { slug: "kesrox-pharma" },
      });
      if (demoKesrox && demoKesrox.id !== manualKesrox.id) {
        await prisma.employee.updateMany({
          where: { companyId: demoKesrox.id },
          data: { companyId: manualKesrox.id },
        });
        await prisma.lead.updateMany({
          where: { companyId: demoKesrox.id },
          data: { companyId: manualKesrox.id },
        });
        await prisma.user.updateMany({
          where: { companyId: demoKesrox.id },
          data: { companyId: manualKesrox.id },
        });
        await prisma.companySettings.deleteMany({
          where: { companyId: demoKesrox.id },
        });
        await prisma.company.delete({
          where: { id: demoKesrox.id },
        });
      }

      company = manualKesrox;
    } else {
      // Fallback: Ensure Kesrox Pharmaceuticals exists
      company = await prisma.company.upsert({
        where: { slug: "kesrox-pharma" },
        update: {
          name: "Kesrox Pharmaceuticals",
          contactEmail: "info@kesrox.com",
          contactPhone: "+91 76965 52865",
        },
        create: {
          name: "Kesrox Pharmaceuticals",
          slug: "kesrox-pharma",
          contactEmail: "info@kesrox.com",
          contactPhone: "+91 76965 52865",
          planTier: "CORE_LEAD_SUITE",
        },
      });

      await prisma.companySettings.upsert({
        where: { id: "settings_kesrox" },
        update: {
          companyId: company.id,
          ...kesroxSettingsData,
        },
        create: {
          id: "settings_kesrox",
          companyId: company.id,
          ...kesroxSettingsData,
        },
      });
    }

    // 3. Provision Kesrox Admin User
    const adminEmail = "admin.kesrox@pharmacrm.test";
    const adminPasswordHash = await bcrypt.hash("admin123", 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        companyId: company.id,
      },
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        companyId: company.id,
      },
    });

    // 4. Provision Test Employee: Savi Kesorx
    const email = "savi.kesorx@pharmacrm.test";
    const passwordHash = await bcrypt.hash("employee123", 10);
    const phoneNumber = "+91 98722 44331";
    const name = "Savi Kesorx";

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: Role.EMPLOYEE,
          companyId: company?.id || null,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, companyId: company?.id || null },
      });
    }

    let employee = await prisma.employee.findUnique({
      where: { userId: user.id },
    });

    if (!employee) {
      const existingPhone = await prisma.employee.findUnique({ where: { phoneNumber } });
      const finalPhone = existingPhone ? `+91 98722 ${Math.floor(10000 + Math.random() * 90000)}` : phoneNumber;

      employee = await prisma.employee.create({
        data: {
          userId: user.id,
          companyId: company?.id || null,
          name,
          phoneNumber: finalPhone,
        },
      });
    }

    // 5. Seed active session for Savi
    const existingSession = await prisma.employeeSession.findFirst({
      where: { employeeId: employee.id, status: "ACTIVE" },
    });
    if (!existingSession) {
      await prisma.employeeSession.create({
        data: {
          employeeId: employee.id,
          loginTime: new Date(),
          workingHours: 6.5,
          status: "ACTIVE",
          deviceInfo: "Android 14 / Chrome Mobile (OnePlus 12 Field Device)",
          ipAddress: "192.168.1.118",
        },
      });
    }

    // 6. Ensure Kesrox leads only reflect active channels (Meta Ads & Excel Import)
    if (company) {
      await prisma.lead.updateMany({
        where: {
          companyId: company.id,
          source: { in: [LeadSource.INDIAMART, LeadSource.WHATSAPP, LeadSource.WEBSITE, LeadSource.SOCIAL] },
        },
        data: {
          source: LeadSource.META,
        },
      });
    }

    const leadCount = await prisma.lead.count({ where: { assignedEmployeeId: employee.id } });
    if (leadCount === 0 && company) {
      await prisma.lead.createMany({
        data: [
          {
            name: "Dr. Sandeep Oberoi",
            phoneNumber: "+91 98881 22334",
            city: "Mohali",
            state: "Punjab",
            division: "PCD_FRANCHISE",
            source: LeadSource.META,
            status: LeadStatus.INTERESTED,
            companyId: company.id,
            assignedEmployeeId: employee.id,
            inquiryDetails: "Requires monopoly PCD franchise rights for Mohali & Zirakpur zone. High demand for Antibiotics and Pediatric range.",
          },
          {
            name: "Amanjot Kaur (Patiala Medicos)",
            phoneNumber: "+91 98765 44321",
            city: "Patiala",
            state: "Punjab",
            division: "PCD_FRANCHISE",
            source: LeadSource.EXCEL_IMPORT,
            sourceTag: "Punjab Chemist Directory",
            status: LeadStatus.CONTACTED,
            companyId: company.id,
            assignedEmployeeId: employee.id,
            inquiryDetails: "Discussed initial stock order for Cefixime 200mg DT and Pantoprazole DSR. Requested sample visual aids.",
          },
          {
            name: "Verma Healthcare LLP",
            phoneNumber: "+91 94170 88990",
            city: "Chandigarh",
            state: "Punjab",
            division: "THIRD_PARTY",
            source: LeadSource.META,
            status: LeadStatus.NEW,
            companyId: company.id,
            assignedEmployeeId: employee.id,
            inquiryDetails: "Third-party contract manufacturing inquiry for 10,000 boxes of gastro & anti-inflammatory capsules.",
          },
        ],
      });
    }

    // 7. Re-link existing Kesarox / Bhopal calls to Savi & seed realistic calls if needed
    await prisma.call.updateMany({
      where: {
        OR: [
          { transcript: { contains: "Kesarox" } },
          { transcript: { contains: "Bhopal" } },
          { aiSummary: { contains: "Bhopal" } },
          { aiSummary: { contains: "Kanu (Bhopal)" } },
        ],
      },
      data: {
        employeeId: employee.id,
      },
    });

    const saviCallsCount = await prisma.call.count({ where: { employeeId: employee.id } });
    if (saviCallsCount < 3) {
      const saviLeads = await prisma.lead.findMany({ where: { assignedEmployeeId: employee.id } });
      const drSandeep = saviLeads.find((l) => (l.name ?? "").includes("Sandeep")) || saviLeads[0];
      const amanjot = saviLeads.find((l) => (l.name ?? "").includes("Amanjot")) || saviLeads[1];
      const verma = saviLeads.find((l) => (l.name ?? "").includes("Verma")) || saviLeads[2];

      const now = new Date();
      await prisma.call.createMany({
        data: [
          {
            employeeId: employee.id,
            leadId: drSandeep?.id || null,
            direction: "INBOUND",
            missed: false,
            durationSec: 52,
            occurredAt: new Date(now.getTime() - 1000 * 60 * 35),
            recordingUrl: "https://drive.google.com/file/d/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3/view",
            transcript: `Employee (Savi): Hello, Kesrox Pharmaceuticals me aapka swagat hai.\nCustomer (Dr. Sandeep): Haan ji, mujhe Mohali aur Zirakpur territory ke liye PCD monopoly distribution chahiye.\nEmployee (Savi): Bilkul doctor sahab, Kesrox ka Mohali territory vacant hai. Aapko Antibiotics aur Pediatric range me stock list WhatsApp kar rahi hoon.\nCustomer (Dr. Sandeep): Theek hai, pricing aur promotional schemes bhi send kar dijiye.\nEmployee (Savi): Ji sir, visual aids, sample kits aur complete catalog WhatsApp pe forward kar diya hai.`,
            aiSummary: "Dr. Sandeep Oberoi ne Mohali & Zirakpur zone ke liye Kesrox Pharmaceuticals PCD monopoly distribution rights ki inquiry ki hai. High demand for Antibiotics & Pediatric range. Savi ne catalog aur visual aid material WhatsApp par dispatch kar diya hai.",
            behaviorTags: ["🔥 Hot Lead", "PCD Monopoly - Mohali", "High Commercial Value", "Antibiotics & Pediatric"],
            whatsappSent: true,
          },
          {
            employeeId: employee.id,
            leadId: amanjot?.id || null,
            direction: "OUTBOUND",
            missed: false,
            durationSec: 42,
            occurredAt: new Date(now.getTime() - 1000 * 60 * 120),
            recordingUrl: "https://drive.google.com/file/d/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3/view",
            transcript: `Employee (Savi): Hello Amanjot ji, Kesrox Pharmaceuticals se Savi baat kar rahi hoon.\nCustomer (Amanjot): Haan ji Savi ji, Cefixime 200mg DT aur Pantoprazole DSR ka rate bataiye?\nEmployee (Savi): Mam dono running molecules humare ready stock me hain. Initial trial billing par hum complete promotional support provide karte hain.\nCustomer (Amanjot): Great, aap order form aur quotation WhatsApp pe bhej dijiye.\nEmployee (Savi): Abhi share kar rahi hoon mam.`,
            aiSummary: "Amanjot Kaur (Patiala Medicos) ke sath Cefixime 200mg DT aur Pantoprazole DSR stock trial order par discussion hui. Quotation aur billing terms finalize hone par deal closure ki stage par hai.",
            behaviorTags: ["⚡ Warm Lead", "Order In Negotiation", "Patiala Zone", "Cefixime & Pantoprazole"],
            whatsappSent: true,
          },
          {
            employeeId: employee.id,
            leadId: verma?.id || null,
            direction: "INBOUND",
            missed: true,
            durationSec: 0,
            occurredAt: new Date(now.getTime() - 1000 * 60 * 15),
            transcript: "Missed Call - Client attempted connection during peak telecalling hours.",
            aiSummary: "Verma Healthcare LLP (Chandigarh) ne third-party contract manufacturing query par call kiya tha par line disconnect ho gayi. Immediate callback aur WhatsApp follow-up required.",
            behaviorTags: ["⚡ Urgent Callback", "Third-Party Contract", "Unanswered Call"],
            whatsappSent: false,
          },
        ],
      });
    }

    // 8. Provision Ekonmed Remedies Private Limited with Official Meta Suite API
    const ekonmedCompany = await prisma.company.upsert({
      where: { slug: "ekonmed-remedies" },
      update: {
        name: "Ekonmed Remedies Private Limited",
        contactEmail: "admin.ekonmed@allota.internal",
        contactPhone: "+91 98000 00000",
        planTier: "CORE_LEAD_SUITE",
        status: "ACTIVE",
      },
      create: {
        name: "Ekonmed Remedies Private Limited",
        slug: "ekonmed-remedies",
        contactEmail: "admin.ekonmed@allota.internal",
        contactPhone: "+91 98000 00000",
        planTier: "CORE_LEAD_SUITE",
        status: "ACTIVE",
      },
    });

    const ekonmedSettingsData = {
      companyName: "Ekonmed Remedies Private Limited",
      companyId: ekonmedCompany.id,
      metaAppId: "4226729374283881",
      metaPageId: "1342042688984003",
      metaAdAccountId: "act_1090397703391043",
      metaWabaId: "1580714120422358",
      enableAdsInsights: true,
      enableSocialInbox: true,
      enableLeadCenter: true,
      enableLeadsAllotment: true,
      enableLeadsIq: true,
      enableSourcesHub: true,
      enableBillingErp: false,
      enableStockIq: false,
      enableReorders: false,
      enableCreditManagement: false,
      enableClientsManagement: false,
      enableTerritories: false,
    };

    const existingEkonmedSettings = await prisma.companySettings.findFirst({
      where: { companyId: ekonmedCompany.id },
    });

    if (existingEkonmedSettings) {
      await prisma.companySettings.update({
        where: { id: existingEkonmedSettings.id },
        data: ekonmedSettingsData,
      });
    } else {
      await prisma.companySettings.create({
        data: {
          id: `settings_${ekonmedCompany.id}`,
          ...ekonmedSettingsData,
        },
      });
    }

    const ekonmedAdminEmail = "admin.ekonmed@allota.internal";
    const ekonmedAdminPass = await bcrypt.hash("Ekonmed@2026", 10);
    await prisma.user.upsert({
      where: { email: ekonmedAdminEmail },
      update: {
        passwordHash: ekonmedAdminPass,
        companyId: ekonmedCompany.id,
        role: Role.ADMIN,
      },
      create: {
        email: ekonmedAdminEmail,
        passwordHash: ekonmedAdminPass,
        role: Role.ADMIN,
        companyId: ekonmedCompany.id,
      },
    });

    await prisma.loginDirectory.upsert({
      where: { email: ekonmedAdminEmail },
      update: { companyId: ekonmedCompany.id },
      create: { email: ekonmedAdminEmail, companyId: ekonmedCompany.id },
    });

    return NextResponse.json({
      success: true,
      message: "Kesrox Pharmaceuticals, Kesrox Admin, Savi Kesorx, and Call Logs provisioned successfully!",
      deletedWrongLeadsCount: deletedWrongLeads.count,
      deletedKesroxExcelLeadsCount: deletedKesroxExcelLeads.count,
      deletedWrongLeadsSample: wrongLeadsToDelete.slice(0, 10),
      connectedDriveFolder: "1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3",
      adminUser: {
        email: adminEmail,
        role: "ADMIN",
        company: company.name,
      },
      employee: {
        id: employee.id,
        name: employee.name,
        email: user.email,
        phone: employee.phoneNumber,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
