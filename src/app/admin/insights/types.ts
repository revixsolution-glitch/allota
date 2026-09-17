export interface InsightsSummary {
  // Parties
  totalClients: number;
  totalPcdClients: number;
  totalTpClients: number;
  newClientsMonth: number;
  newPcdClientsMonth: number;
  newTpClientsMonth: number;
  repeatPcdRate: number;
  repeatTpRate: number;

  // Leads & Pipeline
  totalLeads: number;
  totalPcdLeads: number;
  totalTpLeads: number;
  convertedLeads: number;
  convertedPcdLeads: number;
  convertedTpLeads: number;
  overallConversionRate: number;
  pcdConversionRate: number;
  tpConversionRate: number;

  // Commercial Revenue
  totalRevenue: number;
  pcdRevenue: number;
  tpRevenue: number;
  avgPcdOrderValue: number;
  avgTpOrderValue: number;
  totalBoxesShipped: number;

  // Credit & Receivables
  totalCreditIssued: number;
  totalCreditPaid: number;
  totalCreditOutstanding: number;
  pcdCreditOutstanding: number;
  tpCreditOutstanding: number;
  overdueAmount: number;
  overdueCount: number;

  // Warehouse Inventory
  totalSkus: number;
  totalStockBoxes: number;
  totalInventoryCost: number;
  totalInventoryMrp: number;
  lowStockCount: number;
  activePoAlertsCount: number;
  nearExpiryCount90: number;
  nearExpiryCount30: number;
  capitalAtExpiryRisk: number;

  // Reorders & Retention
  activeReorderClients: number;
  reordersDueNowCount: number;
  cadenceDelayedCount: number;
  avgCadenceIntervalDays: number;

  // Workforce & Field Team
  totalEmployees: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  taskCompletionRate: number;

  // Lead Operations & Telephony
  totalCalls: number;
  outboundCalls: number;
  inboundCalls: number;
  missedCalls: number;
  missedCallRate: number;
  whatsappSentCount: number;

  // Territories & Saturation
  allottedTerritoriesCount: number;
  totalTerritoriesCount: number;
  monopolyCoverageRate: number;
}

export interface ChannelStat {
  source: string;
  label: string;
  count: number;
  converted: number;
  winRate: number;
  pctOfDivision: number;
}

export interface PcdClientRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  companyDetails: string | null;
  territory: string;
  ordersCount: number;
  totalSpent: number;
  isRepeatCustomer: boolean;
  cadence: string;
  lastOrderDate: string | null;
  createdAt: string;
}

export interface PcdInquiryRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  source: string;
  status: string;
  targetTerritory: string;
  inquiryDetails: string | null;
  createdAt: string;
}

export interface TerritoryRow {
  id: string;
  state: string;
  city: string;
  isAllotted: boolean;
  partyName: string;
  ordersCount: number;
  totalRevenue: number;
}

export interface ThirdPartyClientRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  companyDetails: string | null;
  ordersCount: number;
  totalSpent: number;
  creditBalance: number;
  cadence: string;
  lastOrderDate: string | null;
  createdAt: string;
}

export interface ThirdPartyInquiryRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  source: string;
  status: string;
  inquiryDetails: string | null;
  createdAt: string;
}

export interface DosageFormStat {
  dosageForm: string;
  totalBoxes: number;
  orderItemsCount: number;
  totalRevenue: number;
  tpBoxes: number;
  pcdBoxes: number;
  pctOfTotal: number;
}

export interface CreditTermStat {
  term: number;
  label: string;
  count: number;
  balance: number;
  total: number;
  collectionPct: number;
  pctOfLedger: number;
}

export interface OverdueCreditRow {
  id: string;
  invoiceNumber: string;
  partyName: string;
  businessType: string;
  phoneNumber: string | null;
  productDetails: string | null;
  daysAsked: number;
  dueDate: string;
  daysOverdue: number;
  totalAmount: number;
  balanceAmount: number;
}

export interface NearExpiryProductRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  dosageForm: string | null;
  batchNumber: string | null;
  stockQty: number;
  rate: number;
  expiryDate: string;
  daysRemaining: number;
  capitalAtRisk: number;
  isCritical: boolean;
}

export interface LowStockProductRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  dosageForm: string | null;
  stockQty: number;
  reorderThreshold: number;
  deficit: number;
  rate: number;
  mrp: number;
  hasPoAlert: boolean;
}

export interface ClientCadenceRow {
  id: string;
  name: string;
  territory: string;
  mrName: string;
  avgInterval: number;
  typicalOrderDay: number;
  cadenceStatus: "DUE_NOW" | "DELAYED" | "APPROACHING" | "HEALTHY";
  daysSinceLastOrder: number;
  lastBilledRate: number;
  routineProductsCount: number;
  totalSpent: number;
}

export interface EmployeePerformanceRow {
  id: string;
  name: string;
  phoneNumber: string;
  clientsCount: number;
  leadsCount: number;
  totalRevenue: number;
  pendingTasksCount: number;
  completedTasksCount: number;
  taskCompletionRate: number;
}

export interface CallOperationRow {
  id: string;
  repName: string;
  targetName: string;
  targetType: "LEAD" | "CLIENT";
  direction: string;
  missed: boolean;
  summary: string | null;
  behaviorTags: string[];
  whatsappSent: boolean;
  occurredAt: string;
}

export interface LeadStageStat {
  stage: string;
  label: string;
  count: number;
  pctOfTotal: number;
}

export interface FollowupTaskRow {
  id: string;
  title: string;
  description: string | null;
  clientName: string;
  repName: string;
  taskType: string;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface InsightsData {
  summary: InsightsSummary;
  pcdChannelStats: ChannelStat[];
  tpChannelStats: ChannelStat[];
  pcdClients: PcdClientRow[];
  pcdInquiries: PcdInquiryRow[];
  territories: TerritoryRow[];
  thirdPartyClients: ThirdPartyClientRow[];
  thirdPartyInquiries: ThirdPartyInquiryRow[];
  dosageFormStats: DosageFormStat[];
  creditTermStats: CreditTermStat[];
  overdueRecords: OverdueCreditRow[];
  nearExpiryProducts: NearExpiryProductRow[];
  lowStockProducts: LowStockProductRow[];
  clientCadenceRows: ClientCadenceRow[];
  employeePerformanceRows: EmployeePerformanceRow[];
  callOperationsRows: CallOperationRow[];
  leadStageStats: LeadStageStat[];
  followupTasks: FollowupTaskRow[];
}
