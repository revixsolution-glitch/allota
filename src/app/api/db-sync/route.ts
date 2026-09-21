import { NextResponse } from "next/server";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Role, LeadSource, LeadStatus, ClientStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureCompanySettingsColumns();

    const driveUrl = "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3";

    // 1. Update company settings with Google Drive link
    await prisma.companySettings.updateMany({
      data: { driveFolderUrl: driveUrl },
    });

    // 2. Ensure Kesrox Pharmaceuticals Company exists
    const kesroxCompany = await prisma.company.upsert({
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
        companyId: kesroxCompany.id,
        companyName: "Kesrox Pharmaceuticals",
        driveFolderUrl: "https://drive.google.com/drive/folders/1Ii13VNYQ_pxTE52Z8cOhJEzHY8w7eV2t?usp=sharing",
        metaAppId: "1422721583164519",
        metaAppSecret: "3a0df9721f48a8c820073b5dbcfbdc39",
        metaAccessToken: "EAAUN9S6ULGcBSvPeeOJjNSd4iKlqF0e8GApt0mfwFGB9Mxa4ZCfzxwLhQ1PimJ749DlgoyO7ZCmazrOd1Pb8a9yJ9zXUNpFmUUoB0W6jLWbXA5p1ptiSXpgnIAZC1DttOci5SpGcjAv0ZAh9YDA3wdLeD5kDu2fqUaGeCWFgZCxQKLBJFphvAV9DQnue0sZBpn0R1ojZBHoubLla0RyZCylqxgthWj1LEczlOxVMkyoSVSk9fIcZBkoVzEiNfLw5SJkxHvK7CtDig8ZAEosV3rLD0hTTs5fmtD5lfSTiwZD",
        metaPageId: "112876304657266",
        metaWabaId: "1460433551636446",
        metaPhoneNumberId: "739027919285346",
      },
      create: {
        id: "settings_kesrox",
        companyId: kesroxCompany.id,
        companyName: "Kesrox Pharmaceuticals",
        driveFolderUrl: "https://drive.google.com/drive/folders/1Ii13VNYQ_pxTE52Z8cOhJEzHY8w7eV2t?usp=sharing",
        metaAppId: "1422721583164519",
        metaAppSecret: "3a0df9721f48a8c820073b5dbcfbdc39",
        metaAccessToken: "EAAUN9S6ULGcBSvPeeOJjNSd4iKlqF0e8GApt0mfwFGB9Mxa4ZCfzxwLhQ1PimJ749DlgoyO7ZCmazrOd1Pb8a9yJ9zXUNpFmUUoB0W6jLWbXA5p1ptiSXpgnIAZC1DttOci5SpGcjAv0ZAh9YDA3wdLeD5kDu2fqUaGeCWFgZCxQKLBJFphvAV9DQnue0sZBpn0R1ojZBHoubLla0RyZCylqxgthWj1LEczlOxVMkyoSVSk9fIcZBkoVzEiNfLw5SJkxHvK7CtDig8ZAEosV3rLD0hTTs5fmtD5lfSTiwZD",
        metaPageId: "112876304657266",
        metaWabaId: "1460433551636446",
        metaPhoneNumberId: "739027919285346",
      },
    });

    let company = kesroxCompany;

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

    // 6. Seed sample client & leads if none assigned
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
            source: LeadSource.INDIAMART,
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
            source: LeadSource.WHATSAPP,
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

    return NextResponse.json({
      success: true,
      message: "Kesrox Pharmaceuticals, Kesrox Admin, Savi Kesorx, and Call Logs provisioned successfully!",
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
