import { NextResponse } from "next/server";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeCompanyId = getActiveCompanyId(session);
    const { searchParams } = new URL(request.url);

    const division = searchParams.get("division");
    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim().toLowerCase();

    const where: Record<string, any> = {
      ...scopeToCompany(activeCompanyId),
    };

    if (division && (division === "PCD_FRANCHISE" || division === "THIRD_PARTY")) {
      where.division = division;
    }
    if (source) {
      where.source = source;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { state: { contains: search, mode: "insensitive" } },
        { inquiryDetails: { contains: search, mode: "insensitive" } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedEmployee: {
          select: { name: true, phoneNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const exportRows = leads.map((l, idx) => ({
      "S.No": idx + 1,
      "Lead ID": l.id,
      "Customer / Party Name": l.name || "N/A",
      "Mobile Number": l.phoneNumber || "N/A",
      "City": l.city || "",
      "State": l.state || "",
      "Division": l.division === "THIRD_PARTY" ? "Third-Party Manufacturing" : "PCD Pharma Franchise",
      "Lead Source": l.source,
      "Batch / Source Tag": l.sourceTag || "",
      "Status": l.status,
      "Inquiry Requirement": l.inquiryDetails || "",
      "Assigned Representative": l.assignedEmployee?.name || "Unassigned",
      "Representative Contact": l.assignedEmployee?.phoneNumber || "",
      "Created Date": l.createdAt.toISOString().split("T")[0],
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    
    // Auto-size columns for a clean presentation
    const colWidths = [
      { wch: 6 },  // S.No
      { wch: 26 }, // Lead ID
      { wch: 28 }, // Customer / Party Name
      { wch: 18 }, // Mobile Number
      { wch: 16 }, // City
      { wch: 16 }, // State
      { wch: 26 }, // Division
      { wch: 16 }, // Lead Source
      { wch: 22 }, // Batch / Source Tag
      { wch: 14 }, // Status
      { wch: 40 }, // Inquiry Requirement
      { wch: 24 }, // Assigned Rep
      { wch: 20 }, // Rep Contact
      { wch: 14 }, // Created Date
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads Export");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const nowStr = new Date().toISOString().split("T")[0];
    const filename = `Leads_Export_${nowStr}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Leads export failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to export leads" },
      { status: 500 }
    );
  }
}
