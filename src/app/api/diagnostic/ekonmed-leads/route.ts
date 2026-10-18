import { NextResponse } from "next/server";
import { defaultPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const company = await defaultPrisma.company.findFirst({
      where: {
        OR: [
          { slug: { contains: "ekonmed" } },
          { name: { contains: "Ekonmed", mode: "insensitive" } },
        ],
      },
      include: {
        leads: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            source: true,
            sourceTag: true,
            status: true,
            inquiryDetails: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      companyId: company?.id,
      companyName: company?.name,
      totalLeadsInDb: company?.leads.length ?? 0,
      leads: company?.leads ?? [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
