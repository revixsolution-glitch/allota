import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { EmployeeDetailView } from "./EmployeeDetailView";
import {
  EmployeeDetailData,
  EmployeeSessionRow,
  EmployeeLeadRow,
  EmployeeReassignmentRow,
  EmployeeCallRow,
  EmployeeClientRow,
  EmployeeTaskRow,
  LeadStatusCount,
  LeadSourceCount,
  DailyCallStat,
} from "./types";

export const dynamic = "force-dynamic";

export default async function AdminEmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const initialTab = sp.tab as "leads" | "reassigned" | "attendance" | "calls" | "clients" | "tasks" | undefined;

  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  const [employee, reassignmentLogs, settings] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      include: {
        company: true,
        user: true,
        clients: {
          include: {
            orders: {
              include: {
                items: {
                  include: { product: true },
                },
              },
              orderBy: { orderDate: "asc" },
            },
            territory: true,
            creditRecords: true,
          },
          orderBy: { createdAt: "desc" },
        },
        leads: {
          include: {
            client: {
              include: { territory: true },
            },
            reassignmentLogs: {
              include: {
                fromEmployee: { select: { id: true, name: true, phoneNumber: true } },
                toEmployee: { select: { id: true, name: true, phoneNumber: true } },
              },
              orderBy: { reassignedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        },
        calls: {
          include: {
            client: {
              include: { territory: true },
            },
            lead: {
              include: { client: { include: { territory: true } } },
            },
          },
          orderBy: { occurredAt: "desc" },
        },
        tasks: {
          include: {
            client: true,
          },
          orderBy: { createdAt: "desc" },
        },
        sessions: {
          orderBy: { loginTime: "desc" },
        },
      },
    }),
    prisma.leadReassignmentLog.findMany({
      where: {
        OR: [
          { toEmployeeId: id },
          { fromEmployeeId: id },
        ],
      },
      include: {
        lead: true,
        fromEmployee: { select: { id: true, name: true, phoneNumber: true } },
        toEmployee: { select: { id: true, name: true, phoneNumber: true } },
      },
      orderBy: { reassignedAt: "desc" },
    }),
    activeCompanyId
      ? prisma.companySettings.findFirst({
          where: { companyId: activeCompanyId },
        })
      : prisma.companySettings.findFirst({
          where: { id: "default" },
        }),
  ]);

  if (!employee) {
    notFound();
  }

  // Cross-tenant security check: ensure employee belongs to active company
  if (activeCompanyId && employee.companyId && employee.companyId !== activeCompanyId) {
    notFound();
  }

  const isCorePlan = !settings?.enableBillingErp && !settings?.enableClientsManagement;

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // 1. Revenue & Client Breakdown (Initial Orders vs Reorders)
  let totalRevenue = 0;
  let initialOrderRevenue = 0;
  let reorderRevenue = 0;
  let newClientsCount = 0;
  let repeatClientsCount = 0;
  let totalOutstandingCredit = 0;

  const clientRows: EmployeeClientRow[] = employee.clients.map((c) => {
    const isNew = !c.isRepeatCustomer || c.createdAt >= sixtyDaysAgo;
    if (isNew) {
      newClientsCount += 1;
    } else {
      repeatClientsCount += 1;
    }

    const clientTotal = c.orders.reduce((s, o) => s + Number(o.amount), 0);
    totalRevenue += clientTotal;

    // First order is initial order, remaining are reorders
    const firstOrder = c.orders[0];
    const initialAmt = firstOrder ? Number(firstOrder.amount) : 0;
    const reorderAmt = clientTotal - initialAmt;

    initialOrderRevenue += initialAmt;
    reorderRevenue += reorderAmt;

    const creditBal = c.creditRecords.reduce(
      (s, cr) => s + Number(cr.balanceAmount),
      0
    );
    totalOutstandingCredit += creditBal;

    const lastOrder = c.orders[c.orders.length - 1];

    return {
      id: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      companyDetails: c.companyDetails,
      territory: c.territory ? `${c.territory.city}, ${c.territory.state}` : "Direct",
      isRepeatCustomer: c.isRepeatCustomer,
      isNewClient: isNew,
      cadence: c.reorderAlertCadence || "MONTHLY",
      ordersCount: c.orders.length,
      initialOrderRevenue: initialAmt,
      reorderRevenue: reorderAmt,
      totalSpent: clientTotal,
      creditBalance: creditBal,
      lastOrderDate: lastOrder ? lastOrder.orderDate.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  // 2. Leads & Funnel Breakdown
  const totalLeads = employee.leads.length;
  const convertedLeads = employee.leads.filter((l) => l.status === "CONVERTED").length;
  const deadLeads = employee.leads.filter((l) => l.status === "NOT_INTERESTED").length;
  const interestedLeads = employee.leads.filter((l) => l.status === "INTERESTED").length;
  const followupLeads = employee.leads.filter(
    (l) => l.status === "CONTACTED" || l.status === "ASSIGNED" || l.status === "NEW"
  ).length;

  const winRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // Commercial Division Breakdown (PCD Pharma vs. Third-Party)
  const pcdLeads = employee.leads.filter((l) => (l.division || "PCD_FRANCHISE") === "PCD_FRANCHISE");
  const thirdPartyLeads = employee.leads.filter((l) => l.division === "THIRD_PARTY");
  const pcdCount = pcdLeads.length;
  const thirdPartyCount = thirdPartyLeads.length;
  const pcdConverted = pcdLeads.filter((l) => l.status === "CONVERTED").length;
  const tpConverted = thirdPartyLeads.filter((l) => l.status === "CONVERTED").length;
  const pcdPct = totalLeads > 0 ? Math.round((pcdCount / totalLeads) * 100) : 0;
  const thirdPartyPct = totalLeads > 0 ? Math.round((thirdPartyCount / totalLeads) * 100) : 0;

  const divisionCounts = {
    pcdCount,
    thirdPartyCount,
    pcdPct,
    thirdPartyPct,
    pcdConverted,
    tpConverted,
  };

  const leadStatusCounts: LeadStatusCount[] = [
    {
      status: "CONVERTED",
      label: "Converted",
      count: convertedLeads,
      pct: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0,
      description: "Signed contracts & commercial billing",
    },
    {
      status: "INTERESTED",
      label: "Interested",
      count: interestedLeads,
      pct: totalLeads > 0 ? Math.round((interestedLeads / totalLeads) * 100) : 0,
      description: "Visual aids, price lists & sample kits shared",
    },
    {
      status: "FOLLOWUP",
      label: "In Talks / Follow-up",
      count: followupLeads,
      pct: totalLeads > 0 ? Math.round((followupLeads / totalLeads) * 100) : 0,
      description: "Credit & exclusive territory discussions ongoing",
    },
    {
      status: "NOT_INTERESTED",
      label: "Dead Leads",
      count: deadLeads,
      pct: totalLeads > 0 ? Math.round((deadLeads / totalLeads) * 100) : 0,
      description: "Marked disqualified/rejected with notes",
    },
  ];

  // Lead Sources
  const sourceMap = new Map<string, number>();
  for (const l of employee.leads) {
    sourceMap.set(l.source, (sourceMap.get(l.source) || 0) + 1);
  }

  const sourceLabels: Record<string, string> = {
    INDIAMART: "IndiaMART BuyLeads",
    META: "Meta Ads (FB/Insta)",
    WEBSITE: "Direct Website Inquiries",
    WHATSAPP: "WhatsApp Business",
    SOCIAL: "Social Media Inbound",
    MANUAL: "Field Visits / Direct",
  };

  const leadSourceCounts: LeadSourceCount[] = Array.from(sourceMap.entries()).map(
    ([source, cnt]) => ({
      source,
      label: sourceLabels[source] || source,
      count: cnt,
      pct: totalLeads > 0 ? Math.round((cnt / totalLeads) * 100) : 0,
    })
  );

  const leadRows: EmployeeLeadRow[] = employee.leads.map((l) => {
    const latestLog = l.reassignmentLogs[0];
    return {
      id: l.id,
      name: l.name || "Inbound Lead",
      phoneNumber: l.phoneNumber,
      source: l.source,
      division: l.division || "PCD_FRANCHISE",
      status: l.status,
      inquiryDetails: l.inquiryDetails,
      reassignedCount: l.reassignedCount,
      reassignedAt: l.reassignedAt ? l.reassignedAt.toISOString() : null,
      reassignmentReason: l.reassignmentReason || latestLog?.reason || null,
      reassignedFrom: latestLog?.fromEmployee?.name || null,
      createdAt: l.createdAt.toISOString(),
    };
  });

  const reassignmentRows: EmployeeReassignmentRow[] = reassignmentLogs.map((log) => {
    const isIncoming = log.toEmployeeId === id;
    return {
      id: log.id,
      leadId: log.leadId,
      leadName: log.lead?.name || "Prospect",
      leadPhone: log.lead?.phoneNumber || null,
      leadSource: log.lead?.source || "MANUAL",
      direction: isIncoming ? "INCOMING" : "OUTGOING",
      otherEmployeeName: isIncoming
        ? (log.fromEmployee?.name || "Unassigned")
        : (log.toEmployee?.name || "Unassigned"),
      otherEmployeePhone: isIncoming
        ? (log.fromEmployee?.phoneNumber || null)
        : (log.toEmployee?.phoneNumber || null),
      reason: log.reason,
      previousStatus: log.previousStatus,
      currentStatus: log.lead?.status || log.newStatus || "ASSIGNED",
      reassignedAt: log.reassignedAt.toISOString(),
    };
  });

  const reassignedToCount = reassignmentLogs.filter((l) => l.toEmployeeId === id).length;
  const reassignedFromCount = reassignmentLogs.filter((l) => l.fromEmployeeId === id).length;

  // 3. Calls & Telephony Breakdown
  const totalCalls = employee.calls.length;
  const connectedCalls = employee.calls.filter((c) => !c.missed).length;
  const missedCalls = employee.calls.filter((c) => c.missed).length;
  const missedCallRate = totalCalls > 0 ? Math.round((missedCalls / totalCalls) * 100) : 0;
  const whatsappSentCount = employee.calls.filter((c) => c.whatsappSent).length;

  const totalDuration = employee.calls.reduce((s, c) => s + (c.durationSec || 0), 0);
  const avgCallDurationSec = connectedCalls > 0 ? Math.round(totalDuration / connectedCalls) : 0;

  // Daily Calls Grouping (Last 7 Days)
  const dailyMap = new Map<string, { total: number; connected: number; missed: number }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    dailyMap.set(label, { total: 0, connected: 0, missed: 0 });
  }

  for (const c of employee.calls) {
    const diffDays = Math.floor(
      (now.getTime() - c.occurredAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays >= 0 && diffDays < 7) {
      const d = c.occurredAt;
      const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      const cur = dailyMap.get(label) || { total: 0, connected: 0, missed: 0 };
      cur.total += 1;
      if (c.missed) {
        cur.missed += 1;
      } else {
        cur.connected += 1;
      }
      dailyMap.set(label, cur);
    }
  }

  const dailyCallStats: DailyCallStat[] = Array.from(dailyMap.entries()).map(
    ([dateLabel, st]) => ({
      dateLabel,
      total: st.total,
      connected: st.connected,
      missed: st.missed,
    })
  );

  const callRows: EmployeeCallRow[] = employee.calls.map((c) => {
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
      targetType: c.client ? "CLIENT" : c.lead ? "LEAD" : "GENERAL",
      direction: c.direction,
      missed: c.missed,
      durationSec: c.durationSec || 0,
      transcript: c.transcript,
      summary: c.aiSummary || c.transcript,
      aiSummary: c.aiSummary,
      behaviorTags: c.behaviorTags || [],
      whatsappSent: c.whatsappSent,
      occurredAt: c.occurredAt.toISOString(),
      leadId: c.leadId,
      leadDivision: c.lead?.division || null,
      leadTerritory: territoryStr,
      leadSource: c.lead?.source || null,
      repName: employee.name,
      companyName: employee.company?.name || "Pharma Desk",
    };
  });

  // 4. Working Hours & Attendance Sessions
  const sessionRows: EmployeeSessionRow[] = employee.sessions.map((s) => ({
    id: s.id,
    loginTime: s.loginTime.toISOString(),
    logoutTime: s.logoutTime ? s.logoutTime.toISOString() : null,
    workingHours: s.workingHours,
    status: s.status,
    deviceInfo: s.deviceInfo,
    ipAddress: s.ipAddress,
  }));

  const totalWorkingHours = employee.sessions.reduce(
    (s, sess) => s + (sess.workingHours || 0),
    0
  );
  const totalSessionsCount = employee.sessions.length;
  const completedSessionsCount = employee.sessions.filter(
    (s) => s.status === "COMPLETED"
  ).length;
  const onTimeSessionsCount = employee.sessions.filter((s) => {
    const hours = s.loginTime.getHours();
    return hours < 10 || (hours === 10 && s.loginTime.getMinutes() === 0);
  }).length;
  const attendanceRate =
    totalSessionsCount > 0
      ? Math.round((onTimeSessionsCount / totalSessionsCount) * 100)
      : 0;

  const avgDailyHours =
    totalSessionsCount > 0
      ? Number((totalWorkingHours / totalSessionsCount).toFixed(1))
      : 0;

  const latestSession = employee.sessions[0];
  const isShiftActive = latestSession?.status === "ACTIVE";

  // 5. Follow-up Tasks
  const taskRows: EmployeeTaskRow[] = employee.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    clientName: t.client ? t.client.name : "Direct Client",
    taskType: t.taskType,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  }));

  const totalTasks = taskRows.length;
  const completedTasks = taskRows.filter((t) => t.status === "COMPLETED").length;
  const pendingTasks = taskRows.filter((t) => t.status !== "COMPLETED").length;
  const taskCompletionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Territory
  const primaryTerritory =
    employee.clients[0]?.territory
      ? `${employee.clients[0].territory.city}, ${employee.clients[0].territory.state}`
      : "Assigned Territory";

  const data: EmployeeDetailData = {
    isCorePlan,
    divisionCounts,
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.user.email,
      phoneNumber: employee.phoneNumber,
      territoryName: primaryTerritory,
      createdAt: employee.createdAt.toISOString(),
      isShiftActive,
      currentSessionLogin: latestSession && isShiftActive ? latestSession.loginTime.toISOString() : null,
    },
    summary: {
      totalRevenue,
      initialOrderRevenue,
      reorderRevenue,
      totalClients: employee.clients.length,
      newClientsCount,
      repeatClientsCount,
      totalLeads,
      convertedLeads,
      deadLeads,
      interestedLeads,
      followupLeads,
      winRate,
      totalCalls,
      connectedCalls,
      missedCalls,
      missedCallRate,
      whatsappSentCount,
      avgCallDurationSec,
      totalWorkingHours,
      avgDailyHours,
      totalSessionsCount,
      completedSessionsCount,
      onTimeSessionsCount,
      attendanceRate,
      reassignedToCount,
      reassignedFromCount,
      totalTasks,
      completedTasks,
      pendingTasks,
      taskCompletionRate,
      totalOutstandingCredit,
    },
    leadStatusCounts,
    leadSourceCounts,
    dailyCallStats,
    sessions: sessionRows,
    leads: leadRows,
    reassignments: reassignmentRows,
    calls: callRows,
    clients: clientRows,
    tasks: taskRows,
  };

  return <EmployeeDetailView data={data} initialTab={initialTab} />;
}
