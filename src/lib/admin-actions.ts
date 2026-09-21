"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AiCallStatus,
  ClientStatus,
  CreditStatus,
  LeadSource,
  LeadStatus,
  Role,
} from "@/generated/prisma/enums";
import { getSession, getActiveCompanyId, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const requiredText = z.string().trim().min(1);
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null));

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== Role.ADMIN && session.role !== Role.SUPER_ADMIN)) {
    redirect("/login");
  }
  return session;
}

const territorySchema = z.object({
  state: requiredText,
  city: requiredText,
});

export async function createTerritory(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = territorySchema.parse({
    state: formData.get("state"),
    city: formData.get("city"),
  });

  await prisma.territory.upsert({
    where: {
      state_city: {
        state: input.state,
        city: input.city,
      },
    },
    update: {
      ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
    },
    create: {
      ...input,
      companyId: activeCompanyId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/territories");
}

const clientSchema = z.object({
  name: requiredText,
  companyDetails: optionalText,
  phoneNumber: optionalText,
  territoryId: optionalText,
  assignedEmployeeId: optionalText,
  status: z.nativeEnum(ClientStatus),
  isRepeatCustomer: z.coerce.boolean().default(false),
});

export async function createClient(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = clientSchema.parse({
    name: formData.get("name"),
    companyDetails: formData.get("companyDetails") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    territoryId: formData.get("territoryId") ?? "",
    assignedEmployeeId: formData.get("assignedEmployeeId") ?? "",
    status: formData.get("status") ?? ClientStatus.ACTIVE,
    isRepeatCustomer: formData.get("isRepeatCustomer") === "on",
  });

  await prisma.client.create({
    data: {
      ...input,
      companyId: activeCompanyId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/employees");
}

const assignmentSchema = z.object({
  clientId: requiredText,
  assignedEmployeeId: optionalText,
});

export async function updateClientAssignment(formData: FormData) {
  await requireAdmin();

  const input = assignmentSchema.parse({
    clientId: formData.get("clientId"),
    assignedEmployeeId: formData.get("assignedEmployeeId") ?? "",
  });

  await prisma.client.update({
    where: { id: input.clientId },
    data: { assignedEmployeeId: input.assignedEmployeeId },
  });

  revalidatePath("/admin/clients");
  revalidatePath("/admin/employees");
}

const leadSchema = z.object({
  source: z.nativeEnum(LeadSource),
  division: optionalText,
  name: optionalText,
  phoneNumber: optionalText,
  assignedEmployeeId: optionalText,
  clientId: optionalText,
  notes: optionalText,
});

export async function createLead(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = leadSchema.parse({
    source: formData.get("source") ?? LeadSource.MANUAL,
    division: formData.get("division") ?? "PCD_FRANCHISE",
    name: formData.get("name") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    assignedEmployeeId: formData.get("assignedEmployeeId") ?? "",
    clientId: formData.get("clientId") ?? "",
    notes: formData.get("notes") ?? "",
  });

  await prisma.lead.create({
    data: {
      source: input.source,
      division: input.division || "PCD_FRANCHISE",
      inquiryDetails: input.notes,
      name: input.name,
      phoneNumber: input.phoneNumber,
      assignedEmployeeId: input.assignedEmployeeId,
      clientId: input.clientId,
      status: input.assignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
      rawPayload: input.notes ? { notes: input.notes } : undefined,
      companyId: activeCompanyId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
}

const allotLeadsSchema = z.object({
  quantity: z.coerce.number().int().min(1),
  employeeId: requiredText,
  division: optionalText,
  source: optionalText,
});

export async function allotLeadsBatch(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = allotLeadsSchema.parse({
    quantity: formData.get("quantity") || 50,
    employeeId: formData.get("employeeId"),
    division: formData.get("division") || "ALL",
    source: formData.get("source") || "ALL",
  });

  const where: Record<string, any> = {
    assignedEmployeeId: null,
    ...(activeCompanyId ? { companyId: activeCompanyId } : {}),
  };

  if (input.division && input.division !== "ALL") {
    where.division = input.division;
  }

  if (input.source && input.source !== "ALL") {
    if (input.source.startsWith("BATCH:")) {
      where.source = LeadSource.EXCEL_IMPORT;
      where.sourceTag = input.source.replace("BATCH:", "");
    } else {
      where.source = input.source as LeadSource;
    }
  }

  const unassignedLeads = await prisma.lead.findMany({
    where,
    take: input.quantity,
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (unassignedLeads.length > 0) {
    const now = new Date();
    const leadIds = unassignedLeads.map((l) => l.id);

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          assignedEmployeeId: input.employeeId,
          status: LeadStatus.ASSIGNED,
          reassignedAt: now,
          reassignmentReason: `Bulk Allotment of ${unassignedLeads.length} leads by Admin`,
        },
      }),
      prisma.leadReassignmentLog.createMany({
        data: leadIds.map((leadId) => ({
          leadId,
          fromEmployeeId: null,
          toEmployeeId: input.employeeId,
          reason: `Direct bulk allotment of ${unassignedLeads.length} leads from unassigned pool by Admin`,
          previousStatus: "NEW",
          newStatus: "ASSIGNED",
          reassignedAt: now,
        })),
      }),
    ]);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${input.employeeId}`);
  revalidatePath("/employee");
}

const leadUpdateSchema = z.object({
  leadId: requiredText,
  status: z.nativeEnum(LeadStatus),
  assignedEmployeeId: optionalText,
});

export async function updateLead(formData: FormData) {
  await requireAdmin();

  const input = leadUpdateSchema.parse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    assignedEmployeeId: formData.get("assignedEmployeeId") ?? "",
  });

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      status: input.status,
      assignedEmployeeId: input.assignedEmployeeId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
}

const creditSchema = z.object({
  clientId: requiredText,
  invoiceNumber: requiredText,
  productDetails: optionalText,
  totalAmount: z.coerce.number().positive(),
  paidAmount: z.coerce.number().min(0).default(0),
  daysAsked: z.coerce.number().int().min(1).default(30),
  notes: optionalText,
  sendAiMessage: z.coerce.boolean().default(true),
  enableAiCall: z.coerce.boolean().default(true),
});

export async function createCreditRecord(formData: FormData) {
  await requireAdmin();

  const raw = {
    clientId: formData.get("clientId"),
    invoiceNumber: formData.get("invoiceNumber"),
    productDetails: formData.get("productDetails") ?? "",
    totalAmount: formData.get("totalAmount"),
    paidAmount: formData.get("paidAmount") || 0,
    daysAsked: formData.get("daysAsked") || 30,
    notes: formData.get("notes") ?? "",
    sendAiMessage: formData.get("sendAiMessage") === "on" || formData.get("sendAiMessage") === "true",
    enableAiCall: formData.get("enableAiCall") === "on" || formData.get("enableAiCall") === "true",
  };

  const input = creditSchema.parse(raw);
  const now = new Date();
  const invoiceDate = now;
  const dueDate = new Date(now.getTime() + input.daysAsked * 24 * 60 * 60 * 1000);
  const balanceAmount = Math.max(0, input.totalAmount - input.paidAmount);

  let status: CreditStatus = CreditStatus.CURRENT;
  if (balanceAmount <= 0) {
    status = CreditStatus.SETTLED;
  } else if (input.daysAsked <= 3) {
    status = CreditStatus.NEARBY_DUE;
  }

  const client = await prisma.client.findUnique({ where: { id: input.clientId } });

  const aiMessagePreview = `Reminder for ${client?.name || "Client"}: Invoice #${input.invoiceNumber} (₹${balanceAmount.toLocaleString("en-IN")}) under ${input.daysAsked}-day credit is scheduled for maturity on ${dueDate.toLocaleDateString("en-IN")}.`;

  await prisma.creditRecord.create({
    data: {
      clientId: input.clientId,
      invoiceNumber: input.invoiceNumber,
      productDetails: input.productDetails,
      totalAmount: input.totalAmount,
      paidAmount: input.paidAmount,
      balanceAmount,
      daysAsked: input.daysAsked,
      invoiceDate,
      dueDate,
      status,
      sendAiMessage: input.sendAiMessage,
      aiMessageStatus: input.sendAiMessage ? "QUEUED_ALERT" : "DISABLED",
      aiMessagePreview,
      enableAiCall: input.enableAiCall,
      aiCallStatus: input.enableAiCall ? AiCallStatus.SCHEDULED : AiCallStatus.IDLE,
      notes: input.notes,
    },
  });

  // Also create Order entry so sales totals stay consistent
  await prisma.order.create({
    data: {
      clientId: input.clientId,
      amount: input.totalAmount,
      orderDate: invoiceDate,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/credits");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/insights");
}

export async function toggleCreditAiAutomation(formData: FormData) {
  await requireAdmin();

  const creditId = formData.get("creditId") as string;
  const field = formData.get("field") as string;
  const enable = formData.get("enable") === "true";

  if (!creditId) return;

  if (field === "message") {
    await prisma.creditRecord.update({
      where: { id: creditId },
      data: {
        sendAiMessage: enable,
        aiMessageStatus: enable ? "QUEUED_ALERT" : "DISABLED",
      },
    });
  } else if (field === "call") {
    await prisma.creditRecord.update({
      where: { id: creditId },
      data: {
        enableAiCall: enable,
        aiCallStatus: enable ? AiCallStatus.SCHEDULED : AiCallStatus.IDLE,
      },
    });
  }

  revalidatePath("/admin/credits");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/insights");
}

export async function triggerAiCreditAlert(formData: FormData) {
  await requireAdmin();

  const creditId = formData.get("creditId") as string;
  if (!creditId) return;

  const record = await prisma.creditRecord.findUnique({
    where: { id: creditId },
    include: { client: true },
  });

  if (!record) return;

  const now = new Date();
  const balanceStr = Number(record.balanceAmount).toLocaleString("en-IN");
  const preview = `[AI Auto-Dispatch] Respected ${record.client.name}: Friendly reminder that invoice #${record.invoiceNumber} of ₹${balanceStr} under your agreed ${record.daysAsked}-day credit cycle is due on ${record.dueDate.toLocaleDateString("en-IN")}. Kindly advise on payment reference.`;

  await prisma.creditRecord.update({
    where: { id: creditId },
    data: {
      lastAiMessageAt: now,
      aiMessageStatus: "DISPATCHED_NOW",
      aiMessagePreview: preview,
    },
  });

  revalidatePath("/admin/credits");
  revalidatePath("/admin/insights");
}

export async function triggerAiCreditCall(formData: FormData) {
  await requireAdmin();

  const creditId = formData.get("creditId") as string;
  if (!creditId) return;

  const record = await prisma.creditRecord.findUnique({
    where: { id: creditId },
    include: { client: true },
  });

  if (!record) return;

  const now = new Date();
  const summary = `AI Voice Bot placed automated call to ${record.client.phoneNumber || "Franchise Partner"}. Spoke with Accounts Manager regarding invoice #${record.invoiceNumber}. Partner confirmed billing reconciliation and committed RTGS transfer within 48 hours.`;

  await prisma.creditRecord.update({
    where: { id: creditId },
    data: {
      lastAiCallAt: now,
      aiCallStatus: AiCallStatus.PROMISED_TO_PAY,
      aiCallSummary: summary,
    },
  });

  revalidatePath("/admin/credits");
  revalidatePath("/admin/insights");
}

export async function recordCreditPayment(formData: FormData) {
  await requireAdmin();

  const creditId = formData.get("creditId") as string;
  const paymentAmount = Number(formData.get("paymentAmount") || 0);

  if (!creditId || paymentAmount <= 0) return;

  const record = await prisma.creditRecord.findUnique({ where: { id: creditId } });
  if (!record) return;

  const newPaid = Number(record.paidAmount) + paymentAmount;
  const newBalance = Math.max(0, Number(record.totalAmount) - newPaid);
  const newStatus = newBalance <= 0 ? CreditStatus.SETTLED : (
    record.dueDate < new Date() ? CreditStatus.OVERDUE : (
      record.dueDate.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000 ? CreditStatus.NEARBY_DUE : CreditStatus.CURRENT
    )
  );

  await prisma.creditRecord.update({
    where: { id: creditId },
    data: {
      paidAmount: newPaid,
      balanceAmount: newBalance,
      status: newStatus,
      aiCallStatus: newBalance <= 0 ? AiCallStatus.COMPLETED : record.aiCallStatus,
      notes: record.notes ? `${record.notes} | Paid ₹${paymentAmount.toLocaleString("en-IN")} on ${new Date().toLocaleDateString("en-IN")}` : `Paid ₹${paymentAmount.toLocaleString("en-IN")}`,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/credits");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/insights");
}

const productStockSchema = z.object({
  name: requiredText,
  sku: requiredText,
  composition: optionalText,
  category: optionalText,
  dosageForm: optionalText,
  batchNumber: requiredText,
  packaging: optionalText,
  stockQty: z.coerce.number().int().min(0).default(0),
  reorderThreshold: z.coerce.number().int().min(0).default(100),
  mrp: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  expiryMonths: z.coerce.number().int().default(12),
  erpSource: optionalText,
});

export async function createProductStock(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const expiryMonths = Number(formData.get("expiryMonths") || 12);
  const now = new Date();
  const expiryDate = new Date(now.getTime() + expiryMonths * 30 * 24 * 60 * 60 * 1000);

  const input = productStockSchema.parse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    composition: formData.get("composition") ?? "",
    category: formData.get("category") || "General",
    dosageForm: formData.get("dosageForm") || "Tablets",
    batchNumber: formData.get("batchNumber"),
    packaging: formData.get("packaging") || "Boxes (10x10 Strips)",
    stockQty: formData.get("stockQty") || 0,
    reorderThreshold: formData.get("reorderThreshold") || 100,
    mrp: formData.get("mrp") || 0,
    rate: formData.get("rate") || 0,
    expiryMonths,
    erpSource: formData.get("erpSource") || "Marg ERP 9+",
  });

  await prisma.product.create({
    data: {
      name: input.name,
      sku: input.sku,
      composition: input.composition,
      category: input.category,
      dosageForm: input.dosageForm || "Tablets",
      batchNumber: input.batchNumber,
      packaging: input.packaging,
      stockQty: input.stockQty,
      reorderThreshold: input.reorderThreshold,
      mrp: input.mrp,
      rate: input.rate,
      expiryDate,
      erpSource: input.erpSource,
      erpSyncId: `MANUAL-${Date.now().toString().slice(-4)}`,
      lastSyncedAt: now,
      companyId: activeCompanyId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/insights");
}

export async function adjustProductStock(formData: FormData) {
  await requireAdmin();

  const productId = formData.get("productId") as string;
  const newStockQty = Number(formData.get("stockQty") || 0);

  if (!productId) return;

  await prisma.product.update({
    where: { id: productId },
    data: {
      stockQty: newStockQty,
      lastSyncedAt: new Date(),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/insights");
}

export async function triggerErpSync() {
  await requireAdmin();

  const now = new Date();
  await prisma.product.updateMany({
    data: {
      lastSyncedAt: now,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/insights");
}

export async function triggerBillingReorderSync() {
  await requireAdmin();

  const now = new Date();
  await prisma.product.updateMany({
    data: {
      lastSyncedAt: now,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/insights");
}

export async function createBilledReorder(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const clientId = String(formData.get("clientId") || "").trim();
  const invoiceNumber = String(formData.get("invoiceNumber") || `MARG-INV-${Date.now().toString().slice(-4)}`).trim();
  const billingSource = String(formData.get("billingSource") || "Marg ERP 9+").trim();
  const productId = String(formData.get("productId") || "").trim();
  const quantity = Number(formData.get("quantity") || 100);
  const rate = Number(formData.get("rate") || 0);

  if (!clientId || !productId || quantity <= 0) {
    throw new Error("Client, product, and positive box quantity are required");
  }

  const amount = quantity * rate;
  const orderDate = new Date();

  await prisma.order.create({
    data: {
      clientId,
      amount,
      orderDate,
      invoiceNumber,
      billingSource,
      orderStatus: "DELIVERED",
      companyId: activeCompanyId,
      items: {
        create: {
          productId,
          quantity,
          price: rate,
        },
      },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/insights");
}

export async function triggerAiReorderReminder(formData: FormData) {
  await requireAdmin();

  const clientId = String(formData.get("clientId") || "").trim();
  const channel = String(formData.get("channel") || "WHATSAPP");

  if (!clientId) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { assignedEmployee: true, territory: true },
  });

  if (!client) return;

  const now = new Date();
  if (client.assignedEmployeeId) {
    await prisma.call.create({
      data: {
        clientId: client.id,
        employeeId: client.assignedEmployeeId,
        direction: "OUTBOUND",
        occurredAt: now,
        aiSummary: channel === "CALL"
          ? `AI Automated Cadence Call placed to ${client.name} regarding upcoming monthly reorder cycle. Client confirmed review of stock allocations.`
          : `AI WhatsApp Reorder Prompt dispatched to ${client.name} (${client.phoneNumber || "registered dealer"}) with monthly replenishment basket.`,
        whatsappSent: channel === "WHATSAPP",
        behaviorTags: ["AI_REORDER_CHASER", channel, client.territory?.city || "General"],
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/insights");
}

export async function assignReorderFollowupTask(formData: FormData) {
  await requireAdmin();

  const clientId = String(formData.get("clientId") || "").trim();
  const priority = (formData.get("priority") || "HIGH") as "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  const notes = String(formData.get("notes") || "").trim();

  if (!clientId) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      assignedEmployee: true,
      territory: true,
      orders: {
        orderBy: { orderDate: "desc" },
        take: 1,
        include: { items: { include: { product: true } } },
      },
    },
  });

  if (!client) return;

  let employeeId = client.assignedEmployeeId;
  if (!employeeId) {
    const firstEmp = await prisma.employee.findFirst();
    employeeId = firstEmp?.id ?? null;
    if (employeeId) {
      await prisma.client.update({
        where: { id: client.id },
        data: { assignedEmployeeId: employeeId },
      });
    }
  }

  if (!employeeId) {
    throw new Error("No employee available to assign task to");
  }

  const lastOrder = client.orders[0];
  const routineItems = lastOrder?.items || [];
  const basketSummary = routineItems
    .slice(0, 3)
    .map((it) => `${it.product.name} (${it.quantity} bxs @ ₹${Number(it.price).toFixed(2)})`)
    .join(", ");

  const now = new Date();
  const dueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  await prisma.followupTask.create({
    data: {
      clientId: client.id,
      assignedEmployeeId: employeeId,
      title: `Monthly Reorder Follow-up: ${client.name}`,
      description: `Urgent reorder contact needed for ${client.name} (${client.territory?.city || "Area"}). Routine items: ${basketSummary || "Standard catalog"}. ${notes}`,
      taskType: "REORDER_FOLLOWUP",
      priority,
      status: "PENDING",
      dueDate,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/clients");
  revalidatePath("/employee");
}

export async function completeFollowupTask(formData: FormData) {
  const taskId = String(formData.get("taskId") || "").trim();
  if (!taskId) return;

  await prisma.followupTask.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reorders");
  revalidatePath("/employee");
}

export async function updateCompanyPlanSettings(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const isSuperAdmin = session.role === Role.SUPER_ADMIN;

  // Cloud Storage & Integration APIs
  const driveFolderUrl = (formData.get("driveFolderUrl") as string)?.trim() || undefined;
  const geminiApiKey = (formData.get("geminiApiKey") as string)?.trim() || undefined;
  const indiaMartApiKey = (formData.get("indiaMartApiKey") as string)?.trim() || undefined;
  const billingSoftwareApiKey = (formData.get("billingSoftwareApiKey") as string)?.trim() || undefined;
  const metaAppId = (formData.get("metaAppId") as string)?.trim() || undefined;
  const metaAppSecret = (formData.get("metaAppSecret") as string)?.trim() || undefined;
  const metaAccessToken = (formData.get("metaAccessToken") as string)?.trim() || undefined;
  const metaPageId = (formData.get("metaPageId") as string)?.trim() || undefined;
  const metaAdAccountId = (formData.get("metaAdAccountId") as string)?.trim() || undefined;
  const metaWabaId = (formData.get("metaWabaId") as string)?.trim() || undefined;
  const metaPhoneNumberId = (formData.get("metaPhoneNumberId") as string)?.trim() || undefined;
  const metaApiKey = (formData.get("metaApiKey") as string)?.trim() || metaAccessToken || undefined;
  const pharmaHopperApiKey = (formData.get("pharmaHopperApiKey") as string)?.trim() || undefined;
  const pharmaVentApiKey = (formData.get("pharmaVentApiKey") as string)?.trim() || undefined;

  const apiPayload = {
    ...(driveFolderUrl !== undefined ? { driveFolderUrl } : {}),
    ...(geminiApiKey !== undefined ? { geminiApiKey } : {}),
    ...(indiaMartApiKey !== undefined ? { indiaMartApiKey } : {}),
    ...(billingSoftwareApiKey !== undefined ? { billingSoftwareApiKey } : {}),
    ...(metaAppId !== undefined ? { metaAppId } : {}),
    ...(metaAppSecret !== undefined ? { metaAppSecret } : {}),
    ...(metaAccessToken !== undefined ? { metaAccessToken } : {}),
    ...(metaPageId !== undefined ? { metaPageId } : {}),
    ...(metaAdAccountId !== undefined ? { metaAdAccountId } : {}),
    ...(metaWabaId !== undefined ? { metaWabaId } : {}),
    ...(metaPhoneNumberId !== undefined ? { metaPhoneNumberId } : {}),
    ...(metaApiKey !== undefined ? { metaApiKey } : {}),
    ...(pharmaHopperApiKey !== undefined ? { pharmaHopperApiKey } : {}),
    ...(pharmaVentApiKey !== undefined ? { pharmaVentApiKey } : {}),
  };

  if (activeCompanyId) {
    const existingSettings = await prisma.companySettings.findFirst({
      where: { companyId: activeCompanyId },
    });

    // Strictly enforce: Only Super Admin can change planTier and module flags.
    // Tenant admins can only update their integration keys.
    if (isSuperAdmin && formData.has("planTier")) {
      const planTier = String(formData.get("planTier") || "CORE_LEAD_SUITE");
      const enableBillingErp = formData.get("enableBillingErp") === "on";
      const enableStockIq = formData.get("enableStockIq") === "on";
      const enableReorders = formData.get("enableReorders") === "on";
      const enableCreditManagement = formData.get("enableCreditManagement") === "on";
      const enableClientsManagement = formData.get("enableClientsManagement") === "on";
      const enableTerritories = formData.get("enableTerritories") === "on";

      await prisma.company.update({
        where: { id: activeCompanyId },
        data: { planTier: planTier as any },
      });

      if (existingSettings) {
        await prisma.companySettings.update({
          where: { id: existingSettings.id },
          data: {
            planTier,
            enableBillingErp,
            enableStockIq,
            enableReorders,
            enableCreditManagement,
            enableClientsManagement,
            enableTerritories,
            ...apiPayload,
          },
        });
      } else {
        await prisma.companySettings.create({
          data: {
            companyId: activeCompanyId,
            planTier,
            enableBillingErp,
            enableStockIq,
            enableReorders,
            enableCreditManagement,
            enableClientsManagement,
            enableTerritories,
            ...apiPayload,
          },
        });
      }
    } else {
      // Standard tenant business admin: Preserves existing plan and modules selected during onboarding
      if (existingSettings) {
        await prisma.companySettings.update({
          where: { id: existingSettings.id },
          data: {
            ...apiPayload,
          },
        });
      } else {
        await prisma.companySettings.create({
          data: {
            companyId: activeCompanyId,
            ...apiPayload,
          },
        });
      }
    }
  } else {
    // Platform default settings (Super Admin only or initial setup)
    if (isSuperAdmin && formData.has("planTier")) {
      const planTier = String(formData.get("planTier") || "CORE_LEAD_SUITE");
      const enableBillingErp = formData.get("enableBillingErp") === "on";
      const enableStockIq = formData.get("enableStockIq") === "on";
      const enableReorders = formData.get("enableReorders") === "on";
      const enableCreditManagement = formData.get("enableCreditManagement") === "on";
      const enableClientsManagement = formData.get("enableClientsManagement") === "on";
      const enableTerritories = formData.get("enableTerritories") === "on";

      await prisma.companySettings.upsert({
        where: { id: "default" },
        update: {
          planTier,
          enableBillingErp,
          enableStockIq,
          enableReorders,
          enableCreditManagement,
          enableClientsManagement,
          enableTerritories,
          ...apiPayload,
        },
        create: {
          id: "default",
          companyName: "Allota AI",
          planTier,
          enableBillingErp,
          enableStockIq,
          enableReorders,
          enableCreditManagement,
          enableClientsManagement,
          enableTerritories,
          ...apiPayload,
        },
      });
    } else {
      await prisma.companySettings.upsert({
        where: { id: "default" },
        update: {
          ...apiPayload,
        },
        create: {
          id: "default",
          companyName: "Allota AI",
          ...apiPayload,
        },
      });
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/stock-iq");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/territories");
  revalidatePath("/admin/reorders");
  revalidatePath("/admin/credits");
}

const employeeLeadUpdateSchema = z.object({
  leadId: requiredText,
  status: z.nativeEnum(LeadStatus),
  notes: optionalText,
});

export async function updateEmployeeLeadStatus(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const input = employeeLeadUpdateSchema.parse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    notes: formData.get("notes"),
  });

  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (session.role !== Role.ADMIN && lead.assignedEmployeeId !== session.employeeId) {
    throw new Error("Unauthorized to update this lead");
  }

  const updateData: Record<string, any> = {
    status: input.status,
  };

  if (input.notes) {
    updateData.inquiryDetails = lead.inquiryDetails
      ? `${lead.inquiryDetails}\n[${new Date().toLocaleDateString("en-IN")}]: ${input.notes}`
      : input.notes;
  }

  await prisma.lead.update({
    where: { id: input.leadId },
    data: updateData,
  });

  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads-iq");
  revalidatePath("/admin/employees");
  if (lead.assignedEmployeeId) {
    revalidatePath(`/admin/employees/${lead.assignedEmployeeId}`);
  }
}

const logCallSchema = z.object({
  leadId: requiredText,
  direction: z.string().default("OUTBOUND"),
  callStatus: z.enum(["ANSWERED", "NOT_ANSWERED"]).default("ANSWERED"),
  durationSec: z.coerce.number().min(0).default(180),
  notes: z.string().optional().default(""),
  outcome: z.nativeEnum(LeadStatus).optional(),
});


export async function markWhatsAppAlertSent(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const callId = String(formData.get("callId") || "").trim();
  if (!callId) return { error: "Call ID is required" };

  await prisma.call.update({
    where: { id: callId },
    data: { whatsappSent: true },
  });

  revalidatePath("/admin/calls");
  revalidatePath("/admin/employees");
  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  return { success: true };
}

export async function logEmployeeCall(formData: FormData) {
  const session = await getSession();
  if (!session || !session.employeeId) {
    redirect("/login");
  }

  const rawCallStatus = formData.get("callStatus") === "NOT_ANSWERED" || formData.get("missed") === "true"
    ? "NOT_ANSWERED"
    : "ANSWERED";

  const input = logCallSchema.parse({
    leadId: formData.get("leadId"),
    direction: formData.get("direction") || "OUTBOUND",
    callStatus: rawCallStatus,
    durationSec: rawCallStatus === "NOT_ANSWERED" ? 0 : (formData.get("durationSec") || 180),
    notes: formData.get("notes") || "",
    outcome: formData.get("outcome") || undefined,
  });

  const [lead, rep] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: input.leadId },
    }),
    prisma.employee.findUnique({
      where: { id: session.employeeId },
      select: { name: true },
    }),
  ]);

  if (!lead) throw new Error("Lead not found");

  const now = new Date();
  const isMissed = input.callStatus === "NOT_ANSWERED";

  const behaviorTags: string[] = [];
  let finalSummary = input.notes?.trim() || "";

  if (isMissed) {
    behaviorTags.push("Missed Call", "Unanswered", "Needs Follow-up");
    if (!finalSummary) {
      finalSummary = `Outbound phone call attempted by ${rep?.name || "Representative"}. Prospect did not answer / phone rang out. Follow-up WhatsApp alert suggested.`;
    } else {
      finalSummary = `[Attempted Call - Unanswered]: ${finalSummary}`;
    }
  } else {
    behaviorTags.push("Connected", "Engaged");
    const lower = finalSummary.toLowerCase();
    if (lower.includes("monopoly")) behaviorTags.push("Monopoly Rights");
    if (lower.includes("price") || lower.includes("rate") || lower.includes("quotation")) behaviorTags.push("Pricing & Margins");
    if (lower.includes("sample") || lower.includes("visual aid") || lower.includes("catalog")) behaviorTags.push("Marketing Kit");
    if (lower.includes("order") || lower.includes("advance") || lower.includes("payment")) behaviorTags.push("Commercial Intent");
    if (input.outcome === LeadStatus.INTERESTED) behaviorTags.push("Warm Prospect");
    if (input.outcome === LeadStatus.CONVERTED) behaviorTags.push("High Intent / Deal Signed");
    if (input.outcome === LeadStatus.NOT_INTERESTED) behaviorTags.push("Disqualified / Non-target");

    if (!finalSummary) {
      finalSummary = `Connected discussion conducted by ${rep?.name || "Representative"}. Prospect briefed on product catalog and commercial terms.`;
    }
  }

  await prisma.$transaction([
    prisma.call.create({
      data: {
        employeeId: session.employeeId,
        leadId: input.leadId,
        direction: input.direction,
        missed: isMissed,
        durationSec: isMissed ? 0 : input.durationSec,
        aiSummary: finalSummary,
        behaviorTags,
        occurredAt: now,
      },
    }),
    prisma.lead.update({
      where: { id: input.leadId },
      data: {
        status:
          input.outcome ||
          (lead.status === LeadStatus.NEW || lead.status === LeadStatus.ASSIGNED
            ? LeadStatus.CONTACTED
            : lead.status),
        inquiryDetails: lead.inquiryDetails
          ? `${lead.inquiryDetails}\n[${isMissed ? "Missed Call" : "Call Touchpoint"} ${now.toLocaleDateString("en-IN")}]: ${finalSummary}`
          : finalSummary,
      },
    }),
  ]);

  revalidatePath("/admin/calls");
  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads-iq");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${session.employeeId}`);
}

export async function createCompanyEmployee(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "employee123").trim();
  const phoneNumber = String(formData.get("phoneNumber") || "").trim();

  if (!name || !email || !phoneNumber) {
    return { error: "Name, email, and phone number are required." };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { error: `A user with email ${email} already exists.` };
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: Role.EMPLOYEE,
        companyId: activeCompanyId,
      },
    });

    const employee = await tx.employee.create({
      data: {
        userId: user.id,
        name,
        phoneNumber,
        companyId: activeCompanyId,
      },
    });

    return { user, employee };
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin/leads-reassign");
  return { success: true, employeeId: result.employee.id };
}




