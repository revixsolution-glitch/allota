import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { InsightsDashboard } from "./InsightsDashboard";
import {
  InsightsData,
  InsightsSummary,
  ChannelStat,
  PcdClientRow,
  PcdInquiryRow,
  TerritoryRow,
  ThirdPartyClientRow,
  ThirdPartyInquiryRow,
  DosageFormStat,
  CreditTermStat,
  OverdueCreditRow,
  NearExpiryProductRow,
  LowStockProductRow,
  ClientCadenceRow,
  EmployeePerformanceRow,
  CallOperationRow,
  LeadStageStat,
  FollowupTaskRow,
} from "./types";

export const dynamic = "force-dynamic";

export default async function AdminInsightsPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const [
    clients,
    leads,
    orders,
    creditRecords,
    territories,
    products,
    employees,
    calls,
    tasks,
    poAlerts,
  ] = await Promise.all([
    prisma.client.findMany({
      where: companyScope,
      include: {
        territory: true,
        assignedEmployee: true,
        orders: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
        creditRecords: true,
        tasks: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.findMany({
      where: companyScope,
      include: {
        client: {
          include: { territory: true },
        },
        assignedEmployee: true,
        calls: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: companyScope,
      include: {
        client: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { orderDate: "desc" },
    }),
    prisma.creditRecord.findMany({
      where: activeCompanyId ? { client: { companyId: activeCompanyId } } : {},
      include: {
        client: true,
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.territory.findMany({
      where: companyScope,
      include: {
        clients: {
          include: {
            orders: true,
          },
        },
      },
    }),
    prisma.product.findMany({
      where: companyScope,
      include: {
        alerts: true,
      },
      orderBy: { stockQty: "asc" },
    }),
    prisma.employee.findMany({
      where: companyScope,
      include: {
        clients: {
          include: {
            orders: true,
          },
        },
        leads: true,
        tasks: true,
        calls: true,
      },
    }),
    prisma.call.findMany({
      where: activeCompanyId ? { employee: { companyId: activeCompanyId } } : {},
      include: {
        employee: true,
        lead: true,
        client: true,
      },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.followupTask.findMany({
      where: activeCompanyId ? { client: { companyId: activeCompanyId } } : {},
      include: {
        client: true,
        assignedEmployee: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseOrderAlert.findMany({
      where: activeCompanyId ? { product: { companyId: activeCompanyId } } : {},
      include: {
        product: true,
      },
      orderBy: { triggeredAt: "desc" },
    }),
  ]);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Division Segmentation (PCD vs Third-Party)
  const pcdClientsList = clients.filter((c) => c.businessType !== "THIRD_PARTY");
  const tpClientsList = clients.filter((c) => c.businessType === "THIRD_PARTY");

  const totalPcdClients = pcdClientsList.length;
  const totalTpClients = tpClientsList.length;
  const totalClients = clients.length;

  const newPcdClientsMonth = pcdClientsList.filter(
    (c) => c.createdAt >= thirtyDaysAgo
  ).length;
  const newTpClientsMonth = tpClientsList.filter(
    (c) => c.createdAt >= thirtyDaysAgo
  ).length;
  const newClientsMonth = newPcdClientsMonth + newTpClientsMonth;

  const repeatPcdClients = pcdClientsList.filter((c) => c.isRepeatCustomer).length;
  const repeatPcdRate =
    totalPcdClients > 0
      ? Math.round((repeatPcdClients / totalPcdClients) * 100)
      : 0;

  const repeatTpClients = tpClientsList.filter((c) => c.isRepeatCustomer).length;
  const repeatTpRate =
    totalTpClients > 0
      ? Math.round((repeatTpClients / totalTpClients) * 100)
      : 0;

  // 2. Leads & Inquiries Segmentation
  const pcdLeadsList = leads.filter((l) => l.division !== "THIRD_PARTY");
  const tpLeadsList = leads.filter((l) => l.division === "THIRD_PARTY");

  const totalPcdLeads = pcdLeadsList.length;
  const totalTpLeads = tpLeadsList.length;
  const totalLeads = leads.length;

  const convertedPcdLeads = pcdLeadsList.filter(
    (l) => l.status === "CONVERTED"
  ).length;
  const convertedTpLeads = tpLeadsList.filter(
    (l) => l.status === "CONVERTED"
  ).length;
  const convertedLeads = convertedPcdLeads + convertedTpLeads;

  const pcdConversionRate =
    totalPcdLeads > 0
      ? Math.round((convertedPcdLeads / totalPcdLeads) * 100)
      : 0;
  const tpConversionRate =
    totalTpLeads > 0
      ? Math.round((convertedTpLeads / totalTpLeads) * 100)
      : 0;
  const overallConversionRate =
    totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // PCD Channel Stats
  const pcdSourceMap = new Map<string, { count: number; converted: number }>();
  for (const lead of pcdLeadsList) {
    const s = lead.source;
    const cur = pcdSourceMap.get(s) || { count: 0, converted: 0 };
    cur.count += 1;
    if (lead.status === "CONVERTED") cur.converted += 1;
    pcdSourceMap.set(s, cur);
  }

  const channelLabelMap: Record<string, string> = {
    META: "Meta Ads (FB/Insta)",
    INDIAMART: "IndiaMART BuyLeads",
    WEBSITE: "Direct Website Inquiry",
    WHATSAPP: "WhatsApp Business Direct",
    SOCIAL: "Social Media / Inbound",
    MANUAL: "Field Rep / Walk-in",
  };

  const pcdChannelStats: ChannelStat[] = Array.from(pcdSourceMap.entries()).map(
    ([source, data]) => ({
      source,
      label: channelLabelMap[source] || source,
      count: data.count,
      converted: data.converted,
      winRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
      pctOfDivision:
        totalPcdLeads > 0 ? Math.round((data.count / totalPcdLeads) * 100) : 0,
    })
  );

  // Third-Party Channel Stats
  const tpSourceMap = new Map<string, { count: number; converted: number }>();
  for (const lead of tpLeadsList) {
    const s = lead.source;
    const cur = tpSourceMap.get(s) || { count: 0, converted: 0 };
    cur.count += 1;
    if (lead.status === "CONVERTED") cur.converted += 1;
    tpSourceMap.set(s, cur);
  }

  const tpChannelStats: ChannelStat[] = Array.from(tpSourceMap.entries()).map(
    ([source, data]) => ({
      source,
      label: channelLabelMap[source] || source,
      count: data.count,
      converted: data.converted,
      winRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
      pctOfDivision:
        totalTpLeads > 0 ? Math.round((data.count / totalTpLeads) * 100) : 0,
    })
  );

  // 3. Revenue & Dispatches (Marg ERP 9+ Orders)
  const pcdOrders = orders.filter(
    (o) => o.client?.businessType !== "THIRD_PARTY"
  );
  const tpOrders = orders.filter(
    (o) => o.client?.businessType === "THIRD_PARTY"
  );

  const pcdRevenue = pcdOrders.reduce((s, o) => s + Number(o.amount), 0);
  const tpRevenue = tpOrders.reduce((s, o) => s + Number(o.amount), 0);
  const totalRevenue = pcdRevenue + tpRevenue;

  const avgPcdOrderValue =
    pcdOrders.length > 0 ? Math.round(pcdRevenue / pcdOrders.length) : 0;
  const avgTpOrderValue =
    tpOrders.length > 0 ? Math.round(tpRevenue / tpOrders.length) : 0;

  // Box volumes dispatched
  let totalBoxesShipped = 0;
  for (const o of orders) {
    for (const it of o.items) {
      totalBoxesShipped += it.quantity;
    }
  }

  // 4. Dosage Form Demand Breakdown
  const dosageMap = new Map<
    string,
    {
      totalBoxes: number;
      orderItemsCount: number;
      totalRevenue: number;
      tpBoxes: number;
      pcdBoxes: number;
    }
  >();

  for (const o of orders) {
    const isTp = o.client?.businessType === "THIRD_PARTY";
    for (const it of o.items) {
      const form = it.product?.dosageForm || "General Formulations";
      const cur = dosageMap.get(form) || {
        totalBoxes: 0,
        orderItemsCount: 0,
        totalRevenue: 0,
        tpBoxes: 0,
        pcdBoxes: 0,
      };
      cur.totalBoxes += it.quantity;
      cur.orderItemsCount += 1;
      cur.totalRevenue += Number(it.price) * it.quantity;
      if (isTp) {
        cur.tpBoxes += it.quantity;
      } else {
        cur.pcdBoxes += it.quantity;
      }
      dosageMap.set(form, cur);
    }
  }

  // Ensure all products dosage forms appear
  for (const p of products) {
    const form = p.dosageForm || "General Formulations";
    if (!dosageMap.has(form)) {
      dosageMap.set(form, {
        totalBoxes: 0,
        orderItemsCount: 0,
        totalRevenue: 0,
        tpBoxes: 0,
        pcdBoxes: 0,
      });
    }
  }

  const dosageFormStats: DosageFormStat[] = Array.from(dosageMap.entries())
    .map(([dosageForm, stat]) => ({
      dosageForm,
      totalBoxes: stat.totalBoxes,
      orderItemsCount: stat.orderItemsCount,
      totalRevenue: stat.totalRevenue,
      tpBoxes: stat.tpBoxes,
      pcdBoxes: stat.pcdBoxes,
      pctOfTotal:
        totalBoxesShipped > 0
          ? Math.round((stat.totalBoxes / totalBoxesShipped) * 100)
          : 0,
    }))
    .sort((a, b) => b.totalBoxes - a.totalBoxes);

  // 5. Territories & Exclusive Monopoly Coverage
  const totalTerritoriesCount = territories.length;
  const allottedTerritoriesCount = territories.filter((t) =>
    t.clients.some((c) => c.businessType !== "THIRD_PARTY")
  ).length;
  const monopolyCoverageRate =
    totalTerritoriesCount > 0
      ? Math.round((allottedTerritoriesCount / totalTerritoriesCount) * 100)
      : 0;

  const territoryRows: TerritoryRow[] = territories.map((t) => {
    const assignedClient = t.clients.find((c) => c.businessType !== "THIRD_PARTY");
    const totalRev = t.clients.reduce(
      (s, c) =>
        s +
        c.orders.reduce((os, o) => os + Number(o.amount), 0),
      0
    );
    const totalOrders = t.clients.reduce((s, c) => s + c.orders.length, 0);

    return {
      id: t.id,
      state: t.state,
      city: t.city,
      isAllotted: Boolean(assignedClient),
      partyName: assignedClient ? assignedClient.name : "Vacant / Open District",
      ordersCount: totalOrders,
      totalRevenue: totalRev,
    };
  });

  // 6. Marg ERP Credit Ledger & Receivables
  const totalCreditIssued = creditRecords.reduce(
    (s, c) => s + Number(c.totalAmount),
    0
  );
  const totalCreditPaid = creditRecords.reduce(
    (s, c) => s + Number(c.paidAmount),
    0
  );
  const totalCreditOutstanding = creditRecords.reduce(
    (s, c) => s + Number(c.balanceAmount),
    0
  );

  const pcdCreditOutstanding = creditRecords
    .filter((c) => c.client.businessType !== "THIRD_PARTY")
    .reduce((s, c) => s + Number(c.balanceAmount), 0);

  const tpCreditOutstanding = creditRecords
    .filter((c) => c.client.businessType === "THIRD_PARTY")
    .reduce((s, c) => s + Number(c.balanceAmount), 0);

  const overdueRecordsList = creditRecords.filter(
    (c) =>
      c.status === "OVERDUE" || (c.status !== "SETTLED" && c.dueDate < now)
  );
  const overdueAmount = overdueRecordsList.reduce(
    (s, c) => s + Number(c.balanceAmount),
    0
  );
  const overdueCount = overdueRecordsList.length;

  const overdueRows: OverdueCreditRow[] = overdueRecordsList.map((rec) => {
    const diffDays = Math.ceil(
      (now.getTime() - rec.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      id: rec.id,
      invoiceNumber: rec.invoiceNumber,
      partyName: rec.client.name,
      businessType: rec.client.businessType || "PCD_FRANCHISE",
      phoneNumber: rec.client.phoneNumber,
      productDetails: rec.productDetails,
      daysAsked: rec.daysAsked,
      dueDate: rec.dueDate.toISOString(),
      daysOverdue: Math.max(1, diffDays),
      totalAmount: Number(rec.totalAmount),
      balanceAmount: Number(rec.balanceAmount),
    };
  });

  const creditTermStats: CreditTermStat[] = [15, 30, 45, 60].map((term) => {
    const list = creditRecords.filter((c) =>
      term === 60 ? c.daysAsked >= 60 : c.daysAsked === term
    );
    const sumBalance = list.reduce(
      (s, c) => s + Number(c.balanceAmount),
      0
    );
    const sumTotal = list.reduce((s, c) => s + Number(c.totalAmount), 0);
    const sumPaid = list.reduce((s, c) => s + Number(c.paidAmount), 0);

    return {
      term,
      label: term === 60 ? "60+ Days" : `${term} Days`,
      count: list.length,
      balance: sumBalance,
      total: sumTotal,
      collectionPct: sumTotal > 0 ? Math.round((sumPaid / sumTotal) * 100) : 0,
      pctOfLedger:
        totalCreditIssued > 0
          ? Math.round((sumTotal / totalCreditIssued) * 100)
          : 0,
    };
  });

  // 7. Warehouse Stock IQ & Inventory
  let totalStockBoxes = 0;
  let totalInventoryCost = 0;
  let totalInventoryMrp = 0;

  for (const p of products) {
    totalStockBoxes += p.stockQty;
    totalInventoryCost += p.stockQty * Number(p.rate ?? 0);
    totalInventoryMrp += p.stockQty * Number(p.mrp ?? 0);
  }

  const lowStockList = products.filter((p) => p.stockQty <= p.reorderThreshold);
  const lowStockCount = lowStockList.length;
  const activePoAlertsCount = poAlerts.filter((a) => a.status === "PENDING").length;

  const lowStockProducts: LowStockProductRow[] = lowStockList.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    dosageForm: p.dosageForm,
    stockQty: p.stockQty,
    reorderThreshold: p.reorderThreshold,
    deficit: Math.max(0, p.reorderThreshold - p.stockQty),
    rate: Number(p.rate ?? 0),
    mrp: Number(p.mrp ?? 0),
    hasPoAlert: p.alerts.some((a) => a.status === "PENDING"),
  }));

  // Warehouse Near-Expiry Clearance
  const nearExpiryProducts: NearExpiryProductRow[] = products
    .filter((p) => {
      if (!p.expiryDate) return false;
      const diff = Math.ceil(
        (p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diff > 0 && diff <= 90;
    })
    .map((p) => {
      const daysRemaining = Math.ceil(
        (p.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const rate = Number(p.rate ?? 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        dosageForm: p.dosageForm,
        batchNumber: p.batchNumber,
        stockQty: p.stockQty,
        rate,
        expiryDate: p.expiryDate!.toISOString(),
        daysRemaining,
        capitalAtRisk: p.stockQty * rate,
        isCritical: daysRemaining <= 30,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const nearExpiryCount90 = nearExpiryProducts.length;
  const nearExpiryCount30 = nearExpiryProducts.filter((p) => p.isCritical).length;
  const capitalAtExpiryRisk = nearExpiryProducts.reduce(
    (s, p) => s + p.capitalAtRisk,
    0
  );

  // 8. Reorders & Replenishment Cadence
  const clientCadenceRows: ClientCadenceRow[] = clients.map((c) => {
    const sortedOrders = [...c.orders].sort(
      (a, b) => b.orderDate.getTime() - a.orderDate.getTime()
    );
    const lastOrder = sortedOrders[0];
    const daysSinceLastOrder = lastOrder
      ? Math.floor(
          (now.getTime() - lastOrder.orderDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 60;
    const avgInterval = c.avgReorderIntervalDays || 30;

    let cadenceStatus: "DUE_NOW" | "DELAYED" | "APPROACHING" | "HEALTHY" = "HEALTHY";
    if (daysSinceLastOrder >= avgInterval + 5) {
      cadenceStatus = "DELAYED";
    } else if (daysSinceLastOrder >= avgInterval - 3) {
      cadenceStatus = "DUE_NOW";
    } else if (daysSinceLastOrder >= avgInterval - 7) {
      cadenceStatus = "APPROACHING";
    } else {
      cadenceStatus = "HEALTHY";
    }

    const firstItem = lastOrder?.items[0];
    const lastBilledRate = firstItem ? Number(firstItem.price) : 0;
    const routineProductsCount = new Set(
      c.orders.flatMap((o) => o.items.map((it) => it.productId))
    ).size;
    const totalSpent = c.orders.reduce((s, o) => s + Number(o.amount), 0);

    return {
      id: c.id,
      name: c.name,
      territory: c.territory ? `${c.territory.city}, ${c.territory.state}` : "Direct",
      mrName: c.assignedEmployee ? c.assignedEmployee.name : "Unassigned",
      avgInterval,
      typicalOrderDay: c.typicalOrderDayOfMonth || 5,
      cadenceStatus,
      daysSinceLastOrder,
      lastBilledRate,
      routineProductsCount,
      totalSpent,
    };
  });

  const activeReorderClients = clients.filter((c) => c.isRepeatCustomer).length;
  const reordersDueNowCount = clientCadenceRows.filter(
    (r) => r.cadenceStatus === "DUE_NOW"
  ).length;
  const cadenceDelayedCount = clientCadenceRows.filter(
    (r) => r.cadenceStatus === "DELAYED"
  ).length;
  const avgCadenceIntervalDays =
    clients.length > 0
      ? Math.round(
          clients.reduce((s, c) => s + (c.avgReorderIntervalDays || 30), 0) /
            clients.length
        )
      : 0;

  // 9. Field Workforce & Employee Performance
  const employeePerformanceRows: EmployeePerformanceRow[] = employees.map(
    (emp) => {
      const totalRev = emp.clients.reduce(
        (s, c) =>
          s +
          c.orders.reduce((os, o) => os + Number(o.amount), 0),
        0
      );
      const pendingTasksCount = emp.tasks.filter(
        (t) => t.status !== "COMPLETED"
      ).length;
      const completedTasksCount = emp.tasks.filter(
        (t) => t.status === "COMPLETED"
      ).length;
      const totalTasksCount = emp.tasks.length;
      const taskCompletionRate =
        totalTasksCount > 0
          ? Math.round((completedTasksCount / totalTasksCount) * 100)
          : 100;

      return {
        id: emp.id,
        name: emp.name,
        phoneNumber: emp.phoneNumber,
        clientsCount: emp.clients.length,
        leadsCount: emp.leads.length,
        totalRevenue: totalRev,
        pendingTasksCount,
        completedTasksCount,
        taskCompletionRate,
      };
    }
  ).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalEmployees = employees.length;
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => t.status !== "COMPLETED").length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const taskCompletionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

  const followupTasks: FollowupTaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    clientName: t.client.name,
    repName: t.assignedEmployee.name,
    taskType: t.taskType,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  }));

  // 10. Lead Center Stages & Telephony Calls
  const totalCalls = calls.length;
  const outboundCalls = calls.filter((c) => c.direction === "OUTBOUND").length;
  const inboundCalls = calls.filter((c) => c.direction === "INBOUND").length;
  const missedCalls = calls.filter((c) => c.missed).length;
  const missedCallRate =
    totalCalls > 0 ? Math.round((missedCalls / totalCalls) * 100) : 0;
  const whatsappSentCount = calls.filter((c) => c.whatsappSent).length;

  const callOperationsRows: CallOperationRow[] = calls.map((c) => ({
    id: c.id,
    repName: c.employee.name,
    targetName: c.client ? c.client.name : c.lead ? (c.lead.name || "Inbound Lead") : "Direct Contact",
    targetType: c.client ? "CLIENT" : "LEAD",
    direction: c.direction,
    missed: c.missed,
    summary: c.aiSummary || c.transcript,
    behaviorTags: c.behaviorTags || [],
    whatsappSent: c.whatsappSent,
    occurredAt: c.occurredAt.toISOString(),
  }));

  const leadStageMap = new Map<string, number>();
  for (const l of leads) {
    leadStageMap.set(l.status, (leadStageMap.get(l.status) || 0) + 1);
  }

  const stageOrder = [
    { stage: "NEW", label: "New Leads" },
    { stage: "ASSIGNED", label: "Assigned to MR" },
    { stage: "CONTACTED", label: "Contacted" },
    { stage: "INTERESTED", label: "Product Interested" },
    { stage: "CONVERTED", label: "Signed / Converted" },
    { stage: "NOT_INTERESTED", label: "Not Interested" },
  ];

  const leadStageStats: LeadStageStat[] = stageOrder.map((st) => {
    const cnt = leadStageMap.get(st.stage) || 0;
    return {
      stage: st.stage,
      label: st.label,
      count: cnt,
      pctOfTotal: totalLeads > 0 ? Math.round((cnt / totalLeads) * 100) : 0,
    };
  });

  // 11. PCD and Third-Party Detailed Rows
  const pcdClients: PcdClientRow[] = pcdClientsList.map((c) => {
    const totalSpent = c.orders.reduce((s, o) => s + Number(o.amount), 0);
    const sortedOrders = [...c.orders].sort(
      (a, b) => b.orderDate.getTime() - a.orderDate.getTime()
    );
    const lastOrderDate = sortedOrders[0]
      ? sortedOrders[0].orderDate.toISOString()
      : null;

    return {
      id: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      companyDetails: c.companyDetails,
      territory: c.territory ? `${c.territory.city}, ${c.territory.state}` : "Direct",
      ordersCount: c.orders.length,
      totalSpent,
      isRepeatCustomer: c.isRepeatCustomer,
      cadence: c.reorderAlertCadence || "MONTHLY",
      lastOrderDate,
      createdAt: c.createdAt.toISOString(),
    };
  });

  const thirdPartyClients: ThirdPartyClientRow[] = tpClientsList.map((c) => {
    const totalSpent = c.orders.reduce((s, o) => s + Number(o.amount), 0);
    const creditBalance = c.creditRecords.reduce(
      (s, cr) => s + Number(cr.balanceAmount),
      0
    );
    const sortedOrders = [...c.orders].sort(
      (a, b) => b.orderDate.getTime() - a.orderDate.getTime()
    );
    const lastOrderDate = sortedOrders[0]
      ? sortedOrders[0].orderDate.toISOString()
      : null;

    return {
      id: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      companyDetails: c.companyDetails,
      ordersCount: c.orders.length,
      totalSpent,
      creditBalance,
      cadence: c.reorderAlertCadence || "MONTHLY",
      lastOrderDate,
      createdAt: c.createdAt.toISOString(),
    };
  });

  const pcdInquiries: PcdInquiryRow[] = pcdLeadsList.map((l) => ({
    id: l.id,
    name: l.name || "Franchise Applicant",
    phoneNumber: l.phoneNumber,
    source: l.source,
    status: l.status,
    targetTerritory: l.client?.territory
      ? `${l.client.territory.city}, ${l.client.territory.state}`
      : "Statewide Expansion",
    inquiryDetails: l.inquiryDetails,
    createdAt: l.createdAt.toISOString(),
  }));

  const thirdPartyInquiries: ThirdPartyInquiryRow[] = tpLeadsList.map((l) => ({
    id: l.id,
    name: l.name || "Contract Manufacturing Brand",
    phoneNumber: l.phoneNumber,
    source: l.source,
    status: l.status,
    inquiryDetails: l.inquiryDetails,
    createdAt: l.createdAt.toISOString(),
  }));

  // Summary Object
  const summary: InsightsSummary = {
    totalClients,
    totalPcdClients,
    totalTpClients,
    newClientsMonth,
    newPcdClientsMonth,
    newTpClientsMonth,
    repeatPcdRate,
    repeatTpRate,

    totalLeads,
    totalPcdLeads,
    totalTpLeads,
    convertedLeads,
    convertedPcdLeads,
    convertedTpLeads,
    overallConversionRate,
    pcdConversionRate,
    tpConversionRate,

    totalRevenue,
    pcdRevenue,
    tpRevenue,
    avgPcdOrderValue,
    avgTpOrderValue,
    totalBoxesShipped,

    totalCreditIssued,
    totalCreditPaid,
    totalCreditOutstanding,
    pcdCreditOutstanding,
    tpCreditOutstanding,
    overdueAmount,
    overdueCount,

    totalSkus: products.length,
    totalStockBoxes,
    totalInventoryCost,
    totalInventoryMrp,
    lowStockCount,
    activePoAlertsCount,
    nearExpiryCount90,
    nearExpiryCount30,
    capitalAtExpiryRisk,

    activeReorderClients,
    reordersDueNowCount,
    cadenceDelayedCount,
    avgCadenceIntervalDays,

    totalEmployees,
    totalTasks,
    pendingTasks,
    completedTasks,
    taskCompletionRate,

    totalCalls,
    outboundCalls,
    inboundCalls,
    missedCalls,
    missedCallRate,
    whatsappSentCount,

    allottedTerritoriesCount,
    totalTerritoriesCount,
    monopolyCoverageRate,
  };

  const dashboardData: InsightsData = {
    summary,
    pcdChannelStats,
    tpChannelStats,
    pcdClients,
    pcdInquiries,
    territories: territoryRows,
    thirdPartyClients,
    thirdPartyInquiries,
    dosageFormStats,
    creditTermStats,
    overdueRecords: overdueRows,
    nearExpiryProducts,
    lowStockProducts,
    clientCadenceRows,
    employeePerformanceRows,
    callOperationsRows,
    leadStageStats,
    followupTasks,
  };

  return <InsightsDashboard data={dashboardData} />;
}
