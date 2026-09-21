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

    // 2. Ensure Company exists
    let company = await prisma.company.findFirst({
      where: { slug: "pharma-life" },
    });
    if (!company) {
      company = await prisma.company.findFirst();
    }

    // 3. Provision Test Employee: Savi Kesorx
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

    // 4. Seed active session for Savi
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

    // 5. Seed sample client & leads if none assigned
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

    return NextResponse.json({
      success: true,
      message: "Database columns verified, Google Drive folder connected, and Savi Kesorx test employee provisioned successfully!",
      connectedDriveFolder: "1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3",
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
