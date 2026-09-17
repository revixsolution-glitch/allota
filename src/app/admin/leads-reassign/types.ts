export interface ReassignLeadRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  source: string;
  division: string | null;
  status: string;
  inquiryDetails: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string;
  assignedEmployeePhone: string;
  daysWithCurrentRep: number;
  callsLoggedCount: number;
  reassignedCount: number;
  reassignedAt: string | null;
  reassignmentReason: string | null;
  createdAt: string;
}

export interface EmployeeOption {
  id: string;
  name: string;
  phoneNumber: string;
  totalLeads: number;
  convertedLeads: number;
  deadLeads: number;
  winRate: number;
  territory: string;
}

export interface ReassignmentAuditRow {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  fromEmployeeName: string;
  toEmployeeName: string;
  reason: string | null;
  previousStatus: string | null;
  currentStatus: string;
  reassignedAt: string;
}

export interface ReassignSummary {
  totalLeads: number;
  stagnantLeadsCount: number;
  deadLeadsCount: number;
  totalReassignedCount: number;
  reassignedConvertedCount: number;
  reassignedWinRate: number;
}

export interface LeadsReassignData {
  summary: ReassignSummary;
  leads: ReassignLeadRow[];
  employees: EmployeeOption[];
  auditLogs: ReassignmentAuditRow[];
}
