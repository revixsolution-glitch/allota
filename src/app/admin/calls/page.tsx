import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { AdminCallsView, CallFeedItem, RepSummaryItem } from "./AdminCallsView";

export const dynamic = "force-dynamic";

export default async function AdminCallsPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    redirect("/login");
  }
  const activeCompanyId = getActiveCompanyId(session);

  const [company, calls, employees] = await Promise.all([
    activeCompanyId
      ? prisma.company.findUnique({
          where: { id: activeCompanyId },
          select: { name: true },
        })
      : null,

    prisma.call.findMany({
      where: activeCompanyId ? { employee: { companyId: activeCompanyId } } : {},
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
        calls: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const companyName = company?.name || "Pharma Desk";

  const callFeed: CallFeedItem[] = calls.map((c) => {
    const territoryStr = c.client?.territory
      ? `${c.client.territory.city}, ${c.client.territory.state}`
      : c.lead?.client?.territory
      ? `${c.lead.client.territory.city}, ${c.lead.client.territory.state}`
      : c.lead?.city
      ? `${c.lead.city}${c.lead.state ? `, ${c.lead.state}` : ""}`
      : null;

    return {
      id: c.id,
      targetName: c.client ? c.client.name : c.lead ? (c.lead.name || "Inbound Lead") : "Direct Party",
      targetPhone: c.client?.phoneNumber || c.lead?.phoneNumber || null,
      direction: c.direction,
      missed: c.missed,
      durationSec: c.durationSec || 0,
      aiSummary: c.aiSummary,
      summary: c.aiSummary || c.transcript,
      behaviorTags: c.behaviorTags || [],
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
