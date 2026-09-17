export interface EmployeeSessionRow {
  id: string;
  loginTime: string;
  logoutTime: string | null;
  workingHours: number | null;
  status: string;
  deviceInfo: string | null;
  ipAddress: string | null;
}

export interface EmployeeLeadRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  source: string;
  division: string;
  status: string;
  inquiryDetails: string | null;
  reassignedCount: number;
  reassignedAt: string | null;
  reassignmentReason: string | null;
  reassignedFrom: string | null;
  createdAt: string;
}

export interface EmployeeReassignmentRow {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadSource: string;
  direction: "INCOMING" | "OUTGOING";
  otherEmployeeName: string;
  otherEmployeePhone: string | null;
  reason: string | null;
  previousStatus: string | null;
  currentStatus: string;
  reassignedAt: string;
}

export interface EmployeeCallRow {
  id: string;
  targetName: string;
  targetType: "LEAD" | "CLIENT" | "GENERAL";
  direction: string;
  missed: boolean;
  durationSec: number;
  transcript: string | null;
  summary: string | null;
  behaviorTags: string[];
  whatsappSent: boolean;
  occurredAt: string;
}

export interface EmployeeClientRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  companyDetails: string | null;
  territory: string;
  isRepeatCustomer: boolean;
  isNewClient: boolean;
  cadence: string;
  ordersCount: number;
  initialOrderRevenue: number;
  reorderRevenue: number;
  totalSpent: number;
  creditBalance: number;
  lastOrderDate: string | null;
  createdAt: string;
}

export interface EmployeeTaskRow {
  id: string;
  title: string;
  description: string | null;
  clientName: string;
  taskType: string;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface LeadStatusCount {
  status: string;
  label: string;
  count: number;
  pct: number;
  description: string;
}

export interface LeadSourceCount {
  source: string;
  label: string;
  count: number;
  pct: number;
}

export interface DailyCallStat {
  dateLabel: string;
  total: number;
  connected: number;
  missed: number;
}

export interface EmployeeDivisionCounts {
  pcdCount: number;
  thirdPartyCount: number;
  pcdPct: number;
  thirdPartyPct: number;
  pcdConverted: number;
  tpConverted: number;
}

export interface EmployeeDetailData {
  isCorePlan: boolean;
  divisionCounts: EmployeeDivisionCounts;
  employee: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string;
    territoryName: string;
    createdAt: string;
    isShiftActive: boolean;
    currentSessionLogin: string | null;
  };
  summary: {
    totalRevenue: number;
    initialOrderRevenue: number;
    reorderRevenue: number;
    totalClients: number;
    newClientsCount: number;
    repeatClientsCount: number;
    totalLeads: number;
    convertedLeads: number;
    deadLeads: number;
    interestedLeads: number;
    followupLeads: number;
    winRate: number;
    totalCalls: number;
    connectedCalls: number;
    missedCalls: number;
    missedCallRate: number;
    whatsappSentCount: number;
    avgCallDurationSec: number;
    totalWorkingHours: number;
    avgDailyHours: number;
    totalSessionsCount: number;
    completedSessionsCount: number;
    onTimeSessionsCount: number;
    attendanceRate: number;
    reassignedToCount: number;
    reassignedFromCount: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    taskCompletionRate: number;
    totalOutstandingCredit: number;
  };
  leadStatusCounts: LeadStatusCount[];
  leadSourceCounts: LeadSourceCount[];
  dailyCallStats: DailyCallStat[];
  sessions: EmployeeSessionRow[];
  leads: EmployeeLeadRow[];
  reassignments: EmployeeReassignmentRow[];
  calls: EmployeeCallRow[];
  clients: EmployeeClientRow[];
  tasks: EmployeeTaskRow[];
}
