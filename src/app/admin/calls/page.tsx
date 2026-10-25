import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany, scopeViaRelation } from "@/lib/auth";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { cleanContactDisplayName } from "@/lib/call-helpers";
import { AdminCallsView, CallFeedItem, RepSummaryItem } from "./AdminCallsView";

export const dynamic = "force-dynamic";

interface AdminCallsPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
    search?: string;
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

  // A call belongs to the company of the rep who made it. Fails (throws) if no
  // company is selected, instead of returning every company's calls.
  const callWhere: any = {
    ...scopeViaRelation(activeCompanyId, "employee"),
    ...callDateFilter,
  };

  const companyPromise = prisma.company.findUnique({
    where: { id: scopeToCompany(activeCompanyId).companyId },
    select: { name: true },
  });

  let company: any = null;
  let calls: any[] = [];
  let employees: any[] = [];

  try {
    const [comp, fetchedCalls, fetchedEmps] = await Promise.all([
      companyPromise,
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
        where: scopeToCompany(activeCompanyId),
        include: {
          calls: Object.keys(callDateFilter).length > 0 ? { where: callDateFilter } : true,
        },
        orderBy: { name: "asc" },
      }),
    ]);
    company = comp;
    calls = fetchedCalls;
    employees = fetchedEmps;
  } catch (err) {
    console.warn("Error fetching calls from primary tenant DB:", err);
  }

  const companyName = company?.name || "Allota AI";

  // Deduplicate calls to ensure no duplicate cards ever render
  const urlToCall = new Map<string, any>();
  for (const c of calls) {
    const key = c.recordingUrl || `${c.id}`;
    const existing = urlToCall.get(key);
    if (!existing) {
      urlToCall.set(key, c);
    } else {
      const existingIsGeneric = !existing.aiSummary || existing.aiSummary.includes("Call recorded and analyzed") || existing.aiSummary.includes("audio CRM me log");
      const currentIsRicher = Boolean(c.aiSummary && !c.aiSummary.includes("Call recorded and analyzed") && !c.aiSummary.includes("audio CRM me log"));
      if (existingIsGeneric && currentIsRicher) {
        urlToCall.set(key, c);
      } else if ((c.transcript?.length || 0) > (existing.transcript?.length || 0)) {
        urlToCall.set(key, c);
      }
    }
  }
  const deduplicatedCalls = Array.from(urlToCall.values());

  const callFeed: CallFeedItem[] = deduplicatedCalls.map((c) => {
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

    const rawTargetName = c.client
      ? c.client.name
      : c.lead
      ? (c.lead.name || "Direct Party")
      : extractedPhone
      ? `Contact ${extractedPhone}`
      : "Direct Mobile Call";

    const targetName = cleanContactDisplayName(rawTargetName);

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
    const empCalls: any[] = emp.calls || [];
    const total = empCalls.length;
    const connected = empCalls.filter((c: any) => !c.missed).length;
    const missed = empCalls.filter((c: any) => c.missed).length;
    const rate = total > 0 ? Math.round((connected / total) * 100) : 0;
    const totalSec = empCalls.reduce((s: number, c: any) => s + (c.durationSec || 0), 0);
    const avgSec = connected > 0 ? Math.round(totalSec / connected) : 0;
    const waCount = empCalls.filter((c: any) => c.whatsappSent).length;

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
