import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { leadIds, toEmployeeId, toEmployeeIds, reason, resetStatus } = body || {};

  const targetIds: string[] =
    Array.isArray(toEmployeeIds) && toEmployeeIds.length > 0
      ? toEmployeeIds
      : toEmployeeId
      ? [toEmployeeId]
      : [];

  if (!Array.isArray(leadIds) || leadIds.length === 0 || targetIds.length === 0) {
    return NextResponse.json(
      { error: "Invalid request. leadIds array and at least one target employee are required." },
      { status: 400 }
    );
  }

  const targetEmployees = await prisma.employee.findMany({
    where: { id: { in: targetIds } },
  });

  if (targetEmployees.length === 0) {
    return NextResponse.json({ error: "Target employee(s) not found." }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
  });

  const now = new Date();
  const reassignReason = reason?.trim() || "Admin reassigned for performance testing";
  const newStatus = resetStatus || "ASSIGNED";

  // Atomically process each lead reassignment and create audit log
  // If multiple target employees selected (e.g. B and C), distribute round-robin
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const target = targetEmployees[i % targetEmployees.length];

    await prisma.leadReassignmentLog.create({
      data: {
        leadId: lead.id,
        fromEmployeeId: lead.assignedEmployeeId,
        toEmployeeId: target.id,
        reason: reassignReason,
        previousStatus: lead.status,
        newStatus,
        reassignedAt: now,
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedEmployeeId: target.id,
        status: newStatus as any,
        reassignedAt: now,
        reassignmentReason: reassignReason,
        reassignedCount: { increment: 1 },
      },
    });
  }

  const targetNames = targetEmployees.map((e) => e.name).join(", ");

  return NextResponse.json({
    ok: true,
    reassignedCount: leads.length,
    toEmployeeName: targetNames,
  });
}
