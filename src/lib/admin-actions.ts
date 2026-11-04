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
import { getSession, getActiveCompanyId, hashPassword, scopeToCompany } from "@/lib/auth";
import { prisma, defaultPrisma } from "@/lib/prisma";
import { extractPhoneNumber, normalizePhoneKey } from "@/lib/phone-utils";
import { pickNextEmployeeForSource } from "@/lib/lead-assignment";
import { getDefaultFollowUpDate } from "@/lib/follow-up";

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
      ...scopeToCompany(activeCompanyId),
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

  const parsedPhone = extractPhoneNumber(input.phoneNumber);
  const phoneKey = normalizePhoneKey(input.phoneNumber);

  if (phoneKey) {
    // 1. Check existing leads in this company for duplicate phone
    const existingLeads = await prisma.lead.findMany({
      where: {
        phoneNumber: { not: null },
        ...scopeToCompany(activeCompanyId),
      },
      select: {
        id: true,
        phoneNumber: true,
        assignedEmployee: { select: { name: true } },
      },
    });

    const duplicateLead = existingLeads.find(
      (l) => normalizePhoneKey(l.phoneNumber) === phoneKey
    );

    if (duplicateLead) {
      const owner = duplicateLead.assignedEmployee?.name
        ? `Assigned to ${duplicateLead.assignedEmployee.name}`
        : "Unassigned Pool";
      throw new Error(
        `Zero-Duplicate Guarantee: Phone number ${input.phoneNumber} already exists in CRM (${owner}). To prevent duplicate lead data sharing among employees, creation was safely blocked.`
      );
    }

    // 2. Check existing clients in this company
    const existingClients = await prisma.client.findMany({
      where: {
        phoneNumber: { not: null },
        ...scopeToCompany(activeCompanyId),
      },
      select: { phoneNumber: true, name: true },
    });

    const duplicateClient = existingClients.find(
      (c) => normalizePhoneKey(c.phoneNumber) === phoneKey
    );

    if (duplicateClient) {
      throw new Error(
        `Zero-Duplicate Guarantee: Phone number ${input.phoneNumber} is already an active converted client (${duplicateClient.name}).`
      );
    }
  }

  const finalPhone = parsedPhone ? parsedPhone.formatted : input.phoneNumber;

  let assignedEmployeeId = input.assignedEmployeeId;
  let autoAssigned = false;
  if (!assignedEmployeeId) {
    const autoId = await pickNextEmployeeForSource(activeCompanyId, input.source);
    if (autoId) {
      assignedEmployeeId = autoId;
      autoAssigned = true;
    }
  }

  const newLead = await prisma.lead.create({
    data: {
      source: input.source,
      division: input.division || "PCD_FRANCHISE",
      inquiryDetails: input.notes,
      name: input.name,
      phoneNumber: finalPhone,
      assignedEmployeeId,
      clientId: input.clientId,
      status: assignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW,
      followUpAt: getDefaultFollowUpDate(),
      rawPayload: input.notes ? { notes: input.notes } : undefined,
      companyId: activeCompanyId,
    },
  });

  if (autoAssigned && assignedEmployeeId) {
    await prisma.leadReassignmentLog.create({
      data: {
        leadId: newLead.id,
        fromEmployeeId: null,
        toEmployeeId: assignedEmployeeId,
        reason: `Auto-assigned via round-robin (${input.source} source)`,
        previousStatus: "NEW",
        newStatus: "ASSIGNED",
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
  if (assignedEmployeeId) {
    revalidatePath(`/admin/employees/${assignedEmployeeId}`);
  }
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
    ...scopeToCompany(activeCompanyId),
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

  // Fetch candidate unassigned leads with a buffer to handle any filtered duplicates
  const candidateUnassigned = await prisma.lead.findMany({
    where,
    take: Math.max(input.quantity * 3, 200),
    orderBy: { createdAt: "desc" },
    select: { id: true, phoneNumber: true, status: true },
  });

  if (candidateUnassigned.length === 0) {
    return;
  }

  // Fetch all phone numbers already assigned to reps or converted to clients in this company
  const [assignedLeads, existingClients] = await Promise.all([
    prisma.lead.findMany({
      where: {
        assignedEmployeeId: { not: null },
        phoneNumber: { not: null },
        ...scopeToCompany(activeCompanyId),
      },
      select: { phoneNumber: true },
    }),
    prisma.client.findMany({
      where: {
        phoneNumber: { not: null },
        ...scopeToCompany(activeCompanyId),
      },
      select: { phoneNumber: true },
    }),
  ]);

  const assignedPhoneSet = new Set<string>();
  for (const al of assignedLeads) {
    const k = normalizePhoneKey(al.phoneNumber);
    if (k) assignedPhoneSet.add(k);
  }
  for (const cl of existingClients) {
    const k = normalizePhoneKey(cl.phoneNumber);
    if (k) assignedPhoneSet.add(k);
  }

  const leadsToAllot: string[] = [];
  const duplicateLeadIdsToPurge: string[] = [];
  const seenBatchKeys = new Set<string>();

  for (const lead of candidateUnassigned) {
    if (leadsToAllot.length >= input.quantity) break;

    const key = normalizePhoneKey(lead.phoneNumber);
    if (key) {
      if (assignedPhoneSet.has(key) || seenBatchKeys.has(key)) {
        // This unassigned lead is already assigned to an employee or converted client.
        // Purge it from unassigned pool so it is never shared with another rep!
        duplicateLeadIdsToPurge.push(lead.id);
        continue;
      }
      seenBatchKeys.add(key);
      assignedPhoneSet.add(key);
    }

    leadsToAllot.push(lead.id);
  }

  const now = new Date();
  const txs = [];

  if (leadsToAllot.length > 0) {
    txs.push(
      prisma.lead.updateMany({
        where: { id: { in: leadsToAllot } },
        data: {
          assignedEmployeeId: input.employeeId,
          status: LeadStatus.ASSIGNED,
          reassignedAt: now,
          reassignmentReason: `Bulk Allotment of ${leadsToAllot.length} verified zero-duplicate leads by Admin`,
        },
      }),
      prisma.leadReassignmentLog.createMany({
        data: leadsToAllot.map((leadId) => ({
          leadId,
          fromEmployeeId: null,
          toEmployeeId: input.employeeId,
          reason: `Direct bulk allotment of ${leadsToAllot.length} unique leads from unassigned pool by Admin`,
          previousStatus: "NEW",
          newStatus: "ASSIGNED",
          reassignedAt: now,
        })),
      })
    );
  }

  if (duplicateLeadIdsToPurge.length > 0) {
    txs.push(
      prisma.lead.deleteMany({
        where: { id: { in: duplicateLeadIdsToPurge } },
      })
    );
  }

  if (txs.length > 0) {
    await prisma.$transaction(txs);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${input.employeeId}`);
  revalidatePath("/employee");
}

const sourceAssignmentSchema = z.object({
  source: z.nativeEnum(LeadSource),
  employeeId: requiredText,
});

export async function addSourceEmployeeMapping(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = sourceAssignmentSchema.parse({
    source: formData.get("source"),
    employeeId: formData.get("employeeId"),
  });

  const existing = await prisma.leadSourceAssignment.findFirst({
    where: { companyId: activeCompanyId, source: input.source, employeeId: input.employeeId },
  });

  if (!existing) {
    await prisma.leadSourceAssignment.create({
      data: {
        companyId: activeCompanyId,
        source: input.source,
        employeeId: input.employeeId,
      },
    });
  }

  revalidatePath("/admin/sources");
  revalidatePath("/admin/employees");
}

export async function removeSourceEmployeeMapping(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const mappingId = String(formData.get("mappingId") || "").trim();
  if (!mappingId) {
    throw new Error("Mapping id is required");
  }

  await prisma.leadSourceAssignment.deleteMany({
    where: {
      id: mappingId,
      ...scopeToCompany(activeCompanyId),
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath("/admin/employees");
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
      deadAt: input.status === LeadStatus.NOT_INTERESTED ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/dead-leads");
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
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

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

  // The client must belong to the active company — never attach a credit record to another company's client.
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, ...scopeToCompany(activeCompanyId) },
  });
  if (!client) {
    throw new Error("Client not found in this company");
  }

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
      companyId: activeCompanyId,
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
  const pharmaHopperUsername = (formData.get("pharmaHopperUsername") as string)?.trim() || undefined;
  const pharmaHopperPassword = (formData.get("pharmaHopperPassword") as string)?.trim() || undefined;
  const pharmaKhabarApiKey = (formData.get("pharmaKhabarApiKey") as string)?.trim() || undefined;
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
    ...(pharmaHopperUsername !== undefined ? { pharmaHopperUsername } : {}),
    ...(pharmaHopperPassword !== undefined ? { pharmaHopperPassword } : {}),
    ...(pharmaKhabarApiKey !== undefined ? { pharmaKhabarApiKey } : {}),
    ...(pharmaVentApiKey !== undefined ? { pharmaVentApiKey } : {}),
  };

  if (activeCompanyId) {
    const existingSettings = await prisma.companySettings.findFirst({
      where: { companyId: activeCompanyId },
    });
    const company = await prisma.company.findUnique({
      where: { id: activeCompanyId },
    });
    const isDemoCompany =
      !company?.slug ||
      company.slug === "pharma-life" ||
      company.slug === "pharma-life-sciences";
    const canSwitchPlan = isSuperAdmin || isDemoCompany;

    // Only Super Admin and the internal Allota AI Demo account can change planTier and module flags.
    // Real onboarded tenant businesses can only update their integration keys.
    if (canSwitchPlan && formData.has("planTier")) {
      const planTier = String(formData.get("planTier") || "CORE_LEAD_SUITE");
      const isSwitchingToCore = planTier === "CORE_LEAD_SUITE";

      const hasAnyErpCheckbox =
        formData.has("enableBillingErp") ||
        formData.has("enableStockIq") ||
        formData.has("enableReorders") ||
        formData.has("enableCreditManagement") ||
        formData.has("enableClientsManagement") ||
        formData.has("enableTerritories");

      let enableBillingErp = false;
      let enableStockIq = false;
      let enableReorders = false;
      let enableCreditManagement = false;
      let enableClientsManagement = false;
      let enableTerritories = false;

      if (!isSwitchingToCore) {
        if (hasAnyErpCheckbox) {
          enableBillingErp = formData.get("enableBillingErp") === "on";
          enableStockIq = formData.get("enableStockIq") === "on";
          enableReorders = formData.get("enableReorders") === "on";
          enableCreditManagement = formData.get("enableCreditManagement") === "on";
          enableClientsManagement = formData.get("enableClientsManagement") === "on";
          enableTerritories = formData.get("enableTerritories") === "on";
        } else {
          enableBillingErp = true;
          enableStockIq = true;
          enableReorders = true;
          enableCreditManagement = true;
          enableClientsManagement = true;
          enableTerritories = true;
        }
      }

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
  revalidatePath("/employee/dead-leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/dead-leads");
  revalidatePath("/admin/leads-iq");
  revalidatePath("/admin/employees");
  if (lead.assignedEmployeeId) {
    revalidatePath(`/admin/employees/${lead.assignedEmployeeId}`);
  }
}

const leadFollowUpSchema = z.object({
  leadId: requiredText,
  days: z.string().optional(),
  customDate: z.string().optional(),
});

export async function setLeadFollowUp(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const input = leadFollowUpSchema.parse({
    leadId: formData.get("leadId"),
    days: formData.get("days") || undefined,
    customDate: formData.get("customDate") || undefined,
  });

  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (session.role !== Role.ADMIN && session.role !== Role.SUPER_ADMIN && lead.assignedEmployeeId !== session.employeeId) {
    throw new Error("Unauthorized to set follow-up for this lead");
  }

  let followUpAt: Date;
  if (input.customDate) {
    followUpAt = new Date(`${input.customDate}T09:00:00`);
  } else {
    const days = Number(input.days) || 2;
    followUpAt = new Date();
    followUpAt.setDate(followUpAt.getDate() + days);
    followUpAt.setHours(10, 0, 0, 0);
  }

  await prisma.lead.update({
    where: { id: input.leadId },
    data: { followUpAt },
  });

  const attributedEmployeeId = session.employeeId || lead.assignedEmployeeId;
  if (attributedEmployeeId) {
    await prisma.leadFollowUpLog.create({
      data: {
        leadId: input.leadId,
        employeeId: attributedEmployeeId,
        scheduledFor: followUpAt,
      },
    });
  }

  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/follow-ups");
  if (lead.assignedEmployeeId) {
    revalidatePath(`/admin/employees/${lead.assignedEmployeeId}`);
  }
}

const leadActiveStatusSchema = z.object({
  leadId: requiredText,
  status: z.enum(["ACTIVE", "CONVERTED", "DEAD", "IRRELEVANT", "UNSET"]).optional(),
  isDead: z.enum(["true", "false"]).optional(),
  deadReason: z.string().optional(),
});

export async function updateLeadActiveStatus(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const input = leadActiveStatusSchema.parse({
    leadId: formData.get("leadId"),
    status: formData.get("status") || undefined,
    isDead: formData.get("isDead") || undefined,
    deadReason: formData.get("deadReason") || undefined,
  });

  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (session.role !== Role.ADMIN && session.role !== Role.SUPER_ADMIN && lead.assignedEmployeeId !== session.employeeId) {
    throw new Error("Unauthorized to update this lead");
  }

  let newStatus = lead.status;
  let deadAt = lead.deadAt;
  let deadReason = lead.deadReason;
  let clientId = lead.clientId;

  if (input.status === "UNSET") {
    newStatus = lead.assignedEmployeeId ? LeadStatus.ASSIGNED : LeadStatus.NEW;
    deadAt = null;
    deadReason = null;
  } else if (input.status === "CONVERTED") {
    newStatus = LeadStatus.CONVERTED;
    deadAt = null;
    deadReason = null;

    // Graduate converted prospect into a Client under the representative
    if (!clientId) {
      const existingClient = lead.phoneNumber && lead.companyId
        ? await prisma.client.findFirst({
            where: {
              companyId: lead.companyId,
              phoneNumber: lead.phoneNumber,
            },
          })
        : null;

      if (existingClient) {
        clientId = existingClient.id;
      } else if (lead.companyId) {
        const newClient = await prisma.client.create({
          data: {
            companyId: lead.companyId,
            name: lead.name?.trim() || "Converted Client",
            phoneNumber: lead.phoneNumber,
            assignedEmployeeId: lead.assignedEmployeeId,
            businessType: lead.division || "PCD_FRANCHISE",
            status: ClientStatus.ACTIVE,
            companyDetails: `Converted from lead on ${new Date().toLocaleDateString("en-IN")}${
              lead.sourceTag ? ` (${lead.sourceTag})` : ""
            }`,
          },
        });
        clientId = newClient.id;
      }
    }
  } else if (input.status === "DEAD" || input.status === "IRRELEVANT" || input.isDead === "true" || !!input.deadReason) {
    newStatus = LeadStatus.NOT_INTERESTED;
    deadAt = new Date();
    deadReason = input.deadReason || (input.status === "IRRELEVANT" ? "IRRELEVANT" : "DEAD");
  } else if (input.status === "ACTIVE" || input.isDead === "false") {
    newStatus =
      lead.status === LeadStatus.NOT_INTERESTED ||
      lead.status === LeadStatus.CONVERTED ||
      lead.status === LeadStatus.NEW ||
      lead.status === LeadStatus.ASSIGNED
        ? LeadStatus.CONTACTED
        : lead.status;
    deadAt = null;
    deadReason = null;
  }

  // Auto-set upcoming 2 days follow-up if lead is active and has no follow-up scheduled
  const targetFollowUpAt =
    !lead.followUpAt && newStatus !== LeadStatus.NOT_INTERESTED && newStatus !== LeadStatus.CONVERTED
      ? getDefaultFollowUpDate()
      : undefined;

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      status: newStatus,
      deadAt,
      deadReason,
      ...(targetFollowUpAt ? { followUpAt: targetFollowUpAt } : {}),
      ...(clientId ? { clientId } : {}),
    },
  });

  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  revalidatePath("/employee/dead-leads");
  revalidatePath("/employee/clients");
  revalidatePath("/employee/follow-ups");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads-iq");
  revalidatePath("/admin/dead-leads");
  revalidatePath("/admin/employees");
  if (lead.assignedEmployeeId) {
    revalidatePath(`/admin/employees/${lead.assignedEmployeeId}`);
  }
}

const leadRemarkSchema = z.object({
  leadId: requiredText,
  remark: requiredText,
});

export async function addLeadRemark(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const activeCompanyId = getActiveCompanyId(session);

  const input = leadRemarkSchema.parse({
    leadId: formData.get("leadId"),
    remark: formData.get("remark"),
  });

  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (session.role !== Role.ADMIN && session.role !== Role.SUPER_ADMIN && lead.assignedEmployeeId !== session.employeeId) {
    throw new Error("Unauthorized to add a remark to this lead");
  }

  let employeeId: string | null = session.employeeId || lead.assignedEmployeeId;
  if (!employeeId) {
    const fallbackEmp = await prisma.employee.findFirst({
      where: scopeToCompany(activeCompanyId),
    });
    employeeId = fallbackEmp?.id || null;
  }

  if (!employeeId) {
    throw new Error("No representative found to record remark under.");
  }

  await prisma.leadRemark.create({
    data: {
      leadId: input.leadId,
      employeeId,
      remark: input.remark,
    },
  });

  // Global Auto Follow-up: if no follow-up is currently set, automatically schedule for upcoming 2 days
  if (!lead.followUpAt) {
    const autoFollowUp = getDefaultFollowUpDate();
    await prisma.lead.update({
      where: { id: input.leadId },
      data: { followUpAt: autoFollowUp },
    });
    await prisma.leadFollowUpLog.create({
      data: {
        leadId: input.leadId,
        employeeId,
        scheduledFor: autoFollowUp,
      },
    }).catch(() => {});
  }

  revalidatePath("/employee");
  revalidatePath("/employee/leads");
  revalidatePath("/employee/dead-leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/dead-leads");
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

const FOLLOW_UP_CALL_TAG = "Follow-Up";

export async function toggleCallFollowUpFlag(formData: FormData) {
  const session = await getSession();
  if (!session || (session.role !== Role.ADMIN && session.role !== Role.SUPER_ADMIN)) {
    redirect("/login");
  }

  const callId = String(formData.get("callId") || "").trim();
  const flagged = String(formData.get("flagged") || "") === "true";
  if (!callId) return { error: "Call ID is required" };

  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { behaviorTags: true },
  });
  if (!call) return { error: "Call not found" };

  const withoutTag = call.behaviorTags.filter(
    (t) => t.toLowerCase() !== FOLLOW_UP_CALL_TAG.toLowerCase()
  );
  const nextTags = flagged ? [...withoutTag, FOLLOW_UP_CALL_TAG] : withoutTag;

  await prisma.call.update({
    where: { id: callId },
    data: { behaviorTags: nextTags },
  });

  revalidatePath("/admin/calls");
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
  revalidatePath("/employee/dead-leads");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/dead-leads");
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

  const selectedSources = formData
    .getAll("sources")
    .map((s) => String(s))
    .filter((s): s is LeadSource => Object.values(LeadSource).includes(s as LeadSource));

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

    if (selectedSources.length > 0) {
      await tx.leadSourceAssignment.createMany({
        data: selectedSources.map((source) => ({
          companyId: activeCompanyId,
          source,
          employeeId: employee.id,
        })),
      });
    }

    return { user, employee };
  });

  // Login directory lives in the platform's own default database, so a new
  // rep can be found by email even if this company has its own database.
  if (activeCompanyId) {
    await defaultPrisma.loginDirectory.upsert({
      where: { email: result.user.email },
      update: { companyId: activeCompanyId },
      create: { email: result.user.email, companyId: activeCompanyId },
    });
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/leads-reassign");
  revalidatePath("/admin/sources");
  return { success: true, employeeId: result.employee.id };
}

export async function deleteLead(input: string | FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const leadId = typeof input === "string" ? input : (input.get("leadId") as string);
  if (!leadId) {
    throw new Error("leadId is required");
  }

  // Only ever touch a lead that belongs to the active company.
  const where = { id: leadId, ...scopeToCompany(activeCompanyId) };
  const lead = await prisma.lead.findFirst({ where, select: { id: true } });
  if (!lead) {
    throw new Error("Lead not found");
  }

  await prisma.call.updateMany({
    where: { leadId },
    data: { leadId: null },
  });

  await prisma.lead.deleteMany({
    where,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads-reassign");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/dead-leads");
  return { success: true };
}

export async function purgeCorruptedLeads() {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const where: Record<string, any> = {
    OR: [
      { name: { contains: "PCD", mode: "insensitive" as const } },
      { name: { contains: "Pharma Franchise", mode: "insensitive" as const } },
      { name: { contains: "Third Party", mode: "insensitive" as const } },
      { name: { contains: "Third-Party", mode: "insensitive" as const } },
      { name: { contains: "Manufacturing", mode: "insensitive" as const } },
      { name: { contains: "Contract Mfg", mode: "insensitive" as const } },
      {
        AND: [
          { source: LeadSource.EXCEL_IMPORT },
          { name: { startsWith: "Prospect" } },
        ],
      },
    ],
    ...scopeToCompany(activeCompanyId),
  };

  const result = await prisma.lead.deleteMany({ where });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads-reassign");
  revalidatePath("/admin/sources");

  return { success: true, count: result.count };
}

const employeePhoneSchema = z.object({
  employeeId: requiredText,
  phoneNumber: z.string().trim(),
});

/** Change a representative's phone number (used to match phone call events to the rep). */
export async function updateEmployeePhone(formData: FormData) {
  const session = await requireAdmin();
  const activeCompanyId = getActiveCompanyId(session);

  const input = employeePhoneSchema.parse({
    employeeId: formData.get("employeeId"),
    phoneNumber: formData.get("phoneNumber") ?? "",
  });

  const digits = input.phoneNumber.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }
  const formatted = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, ...scopeToCompany(activeCompanyId) },
    select: { id: true },
  });
  if (!employee) throw new Error("Representative not found.");

  const taken = await prisma.employee.findFirst({
    where: { phoneNumber: formatted, id: { not: employee.id } },
    select: { name: true },
  });
  if (taken) throw new Error(`That number already belongs to ${taken.name}.`);

  await prisma.employee.update({ where: { id: employee.id }, data: { phoneNumber: formatted } });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employee.id}`);
}
