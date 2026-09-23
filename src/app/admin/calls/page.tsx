import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { AdminCallsView, CallFeedItem, RepSummaryItem } from "./AdminCallsView";

export const dynamic = "force-dynamic";

interface AdminCallsPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AdminCallsPage(props: AdminCallsPageProps) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    redirect("/login");
  }
  const activeCompanyId = getActiveCompanyId(session);
  const searchParams = props.searchParams ? await props.searchParams : {};
  const dateFilter = parseDashboardDateFilter(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const callDateFilter =
    dateFilter.start && dateFilter.end
      ? { occurredAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { occurredAt: { gte: dateFilter.start } }
      : {};

  const callWhere = {
    ...(activeCompanyId
      ? {
          OR: [
            { employee: { companyId: activeCompanyId } },
            { lead: { companyId: activeCompanyId } },
            { client: { companyId: activeCompanyId } },
          ],
        }
      : {}),
    ...callDateFilter,
  };

  const [company, calls, employees] = await Promise.all([
    activeCompanyId
      ? prisma.company.findUnique({
          where: { id: activeCompanyId },
          select: { name: true },
        })
      : null,

    prisma.call.findMany({
      where: callWhere,
      include: {
        employee: true,
        client: {
          include: { territory: true },
        },
        lead: {
          include: {
            client: { include: { territory: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
    }),

    prisma.employee.findMany({
      where: activeCompanyId ? { companyId: activeCompanyId } : {},
      include: {
        calls: Object.keys(callDateFilter).length > 0 ? { where: callDateFilter } : true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const companyName = company?.name || "Allota AI";

  const callFeed: CallFeedItem[] = calls.map((c) => {
    const territoryStr = c.client?.territory
      ? `${c.client.territory.city}, ${c.client.territory.state}`
      : c.lead?.client?.territory
      ? `${c.lead.client.territory.city}, ${c.lead.client.territory.state}`
      : c.lead?.city
      ? `${c.lead.city}${c.lead.state ? `, ${c.lead.state}` : ""}`
      : null;

    const extractedPhone =
      c.client?.phoneNumber ||
      c.lead?.phoneNumber ||
      c.aiSummary?.match(/(\+?91\d{10}|\b\d{10}\b)/)?.[0] ||
      null;

    const targetName = c.client
      ? c.client.name
      : c.lead
      ? (c.lead.name || "Direct Party")
      : extractedPhone
      ? `Contact ${extractedPhone}`
      : "Direct Mobile Call";

    return {
      id: c.id,
      leadId: c.leadId,
      targetName,
      targetPhone: extractedPhone,
      direction: c.direction,
      missed: c.missed,
      durationSec: c.durationSec || 0,
      transcript: c.transcript,
      aiSummary: c.aiSummary,
      summary: c.aiSummary || c.transcript,
      behaviorTags: c.behaviorTags || [],
      recordingUrl: c.recordingUrl,
      whatsappSent: c.whatsappSent,
      occurredAt: c.occurredAt.toISOString(),
      repId: c.employee.id,
      repName: c.employee.name,
      repPhone: c.employee.phoneNumber,
      leadTerritory: territoryStr,
      leadDivision: c.lead?.division || null,
      companyName,
    };
  });

  const repSummaries: RepSummaryItem[] = employees.map((emp) => {
    const total = emp.calls.length;
    const connected = emp.calls.filter((c) => !c.missed).length;
    const missed = emp.calls.filter((c) => c.missed).length;
    const rate = total > 0 ? Math.round((connected / total) * 100) : 0;
    const totalSec = emp.calls.reduce((s, c) => s + (c.durationSec || 0), 0);
    const avgSec = connected > 0 ? Math.round(totalSec / connected) : 0;
    const waCount = emp.calls.filter((c) => c.whatsappSent).length;

    return {
      id: emp.id,
      name: emp.name,
      phoneNumber: emp.phoneNumber,
      totalCalls: total,
      connectedCalls: connected,
      missedCalls: missed,
      connectionRate: rate,
      avgDurationSec: avgSec,
      whatsappSentCount: waCount,
    };
  });

  return (
    <AdminCallsView
      calls={callFeed}
      reps={repSummaries}
      companyName={companyName}
    />
  );
}
