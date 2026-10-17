import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany, scopeViaRelation } from "@/lib/auth";
import { LeadsReassignView } from "./LeadsReassignView";
import {
  LeadsReassignData,
  ReassignLeadRow,
  EmployeeOption,
  ReassignmentAuditRow,
  ReassignSummary,
} from "./types";

export const dynamic = "force-dynamic";

export default async function AdminLeadsReassignPage({
  searchParams,
}: {
  searchParams?: Promise<{ fromEmployeeId?: string; status?: string }>;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = scopeToCompany(activeCompanyId);

  const params = await searchParams;
  const initialFromEmpId = params?.fromEmployeeId || "ALL";
  const initialStatus = params?.status || "ALL";

  const [rawLeads, rawEmployees, rawAuditLogs] = await Promise.all([
    prisma.lead.findMany({
      where: companyScope,
      include: {
        assignedEmployee: {
          select: { id: true, name: true, phoneNumber: true },
        },
        calls: {
          select: { id: true, createdAt: true },
        },
        reassignmentLogs: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: {
        leads: {
          select: { id: true, status: true },
        },
        clients: {
          include: { territory: true },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.leadReassignmentLog.findMany({
      where: scopeViaRelation(activeCompanyId, "lead"),
      include: {
        lead: {
          select: { id: true, name: true, phoneNumber: true, status: true },
        },
        fromEmployee: {
          select: { id: true, name: true },
        },
        toEmployee: {
          select: { id: true, name: true },
        },
      },
      orderBy: { reassignedAt: "desc" },
      take: 200,
    }),
  ]);

  const nowTime = Date.now();

  const leads: ReassignLeadRow[] = rawLeads.map((l) => {
    const refDate = l.reassignedAt
      ? new Date(l.reassignedAt).getTime()
      : new Date(l.createdAt).getTime();
    const daysWithCurrentRep = Math.max(
      0,
      Math.floor((nowTime - refDate) / (1000 * 60 * 60 * 24))
    );

    return {
      id: l.id,
      name: l.name || "Prospect",
      phoneNumber: l.phoneNumber,
      source: l.source,
      division: l.division,
      status: l.status,
      inquiryDetails: l.inquiryDetails,
      assignedEmployeeId: l.assignedEmployeeId,
      assignedEmployeeName: l.assignedEmployee?.name || "Unassigned",
      assignedEmployeePhone: l.assignedEmployee?.phoneNumber || "—",
      daysWithCurrentRep,
      callsLoggedCount: l.calls.length,
      reassignedCount: l.reassignedCount,
      reassignedAt: l.reassignedAt ? l.reassignedAt.toISOString() : null,
      reassignmentReason: l.reassignmentReason,
      createdAt: l.createdAt.toISOString(),
    };
  });

  const employees: EmployeeOption[] = rawEmployees.map((e) => {
    const totalLeads = e.leads.length;
    const convertedLeads = e.leads.filter((l) => l.status === "CONVERTED").length;
    const deadLeads = e.leads.filter((l) => l.status === "NOT_INTERESTED").length;
    const winRate =
      totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
    const territory = e.clients[0]?.territory
      ? `${e.clients[0].territory.city}, ${e.clients[0].territory.state}`
      : "General Territory";

    return {
      id: e.id,
      name: e.name,
      phoneNumber: e.phoneNumber,
      totalLeads,
      convertedLeads,
      deadLeads,
      winRate,
      territory,
    };
  });

  const auditLogs: ReassignmentAuditRow[] = rawAuditLogs.map((log) => ({
    id: log.id,
    leadId: log.leadId,
    leadName: log.lead?.name || "Deleted Lead",
    leadPhone: log.lead?.phoneNumber || null,
    fromEmployeeName: log.fromEmployee?.name || "Unassigned",
    toEmployeeName: log.toEmployee?.name || "Unknown",
    reason: log.reason,
    previousStatus: log.previousStatus,
    currentStatus: log.lead?.status || log.newStatus || "ASSIGNED",
    reassignedAt: log.reassignedAt.toISOString(),
  }));

  const totalLeads = leads.length;
  const stagnantLeadsCount = leads.filter(
    (l) => l.status !== "CONVERTED" && l.callsLoggedCount === 0
  ).length;
  const deadLeadsCount = leads.filter((l) => l.status === "NOT_INTERESTED").length;
  const reassignedLeads = leads.filter((l) => l.reassignedCount > 0);
  const totalReassignedCount = reassignedLeads.length;
  const reassignedConvertedCount = reassignedLeads.filter(
    (l) => l.status === "CONVERTED"
  ).length;
  const reassignedWinRate =
    totalReassignedCount > 0
      ? Math.round((reassignedConvertedCount / totalReassignedCount) * 100)
      : 0;

  const summary: ReassignSummary = {
    totalLeads,
    stagnantLeadsCount,
    deadLeadsCount,
    totalReassignedCount,
    reassignedConvertedCount,
    reassignedWinRate,
  };

  const data: LeadsReassignData = {
    summary,
    leads,
    employees,
    auditLogs,
  };

  return (
    <LeadsReassignView
      data={data}
      initialFromEmpId={initialFromEmpId}
      initialStatus={initialStatus}
    />
  );
}
