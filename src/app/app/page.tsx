import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { MobileAppClient, MobileLeadItem, MobileCallItem } from "./MobileAppClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Allota Mobile Desk — Executive Leads & AI Calls",
  description: "Live mobile lead desk with 1-tap WhatsApp and AI call briefings.",
};

interface PageProps {
  searchParams?: Promise<{ companyId?: string }>;
}

export default async function MobileAppPage(props: PageProps) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined;
  const session = await getSession();
  const sessionCompanyId = getActiveCompanyId(session);
  const targetCompanyId = resolvedSearchParams?.companyId || sessionCompanyId || "cmubi8zf6000004l8y45hhuds";

  let companyName = "Kesrox";
  let leads: MobileLeadItem[] = [];
  let calls: MobileCallItem[] = [];

  try {
    const [company, rawLeads, rawCalls] = await Promise.all([
      prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: { name: true },
      }),
      prisma.lead.findMany({
        where: { companyId: targetCompanyId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          city: true,
          state: true,
          source: true,
          sourceTag: true,
          status: true,
          inquiryDetails: true,
          createdAt: true,
        },
      }),
      prisma.call.findMany({
        where: { employee: { companyId: targetCompanyId } },
        orderBy: { occurredAt: "desc" },
        take: 30,
        include: {
          employee: { select: { name: true } },
          lead: { select: { name: true, phoneNumber: true } },
          client: { select: { name: true, phoneNumber: true } },
        },
      }),
    ]);

    if (company?.name) {
      companyName = company.name;
    }

    leads = rawLeads.map((l) => ({
      id: l.id,
      name: l.name || "WhatsApp Prospect",
      phoneNumber: l.phoneNumber,
      city: l.city,
      state: l.state,
      source: l.source,
      sourceTag: l.sourceTag,
      status: l.status,
      inquiryDetails: l.inquiryDetails,
      createdAt: l.createdAt.toISOString(),
    }));

    calls = rawCalls.map((c) => {
      const contactName = c.lead?.name || c.client?.name || "Customer Inquiry";
      const contactPhone = c.lead?.phoneNumber || c.client?.phoneNumber || null;
      const isHot = (c.behaviorTags || []).some((t) => t.includes("Hot") || t.includes("🔥"));

      return {
        id: c.id,
        contactName,
        contactPhone,
        employeeName: c.employee?.name || "Representative",
        durationSec: c.durationSec || 0,
        missed: c.missed,
        recordingUrl: c.recordingUrl,
        transcript: c.transcript,
        aiSummary: c.aiSummary,
        behaviorTags: c.behaviorTags || [],
        sentiment: isHot ? "HOT" : "NEUTRAL",
        occurredAt: c.occurredAt.toISOString(),
      };
    });
  } catch (err) {
    console.error("Error loading mobile data for company:", targetCompanyId, err);
  }

  return (
    <MobileAppClient
      companyName={companyName}
      initialLeads={leads}
      initialCalls={calls}
    />
  );
}
