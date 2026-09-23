import { prisma } from "@/lib/prisma";
import { LeadSource } from "@/generated/prisma/enums";

/**
 * Picks the next employee for an incoming lead of the given source, rotating
 * evenly through whichever employees the admin has dedicated to that source.
 * Returns null if no employee is mapped to this source (lead stays unassigned).
 */
export async function pickNextEmployeeForSource(
  companyId: string | null,
  source: LeadSource
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const mappings = await tx.leadSourceAssignment.findMany({
      where: { companyId, source },
      orderBy: { createdAt: "asc" },
      select: { employeeId: true },
    });

    if (mappings.length === 0) return null;

    const employeeIds = mappings.map((m) => m.employeeId);

    const rotation = await tx.leadSourceRotation.findFirst({
      where: { companyId, source },
    });

    let nextIndex = 0;
    if (rotation?.lastAssignedEmployeeId) {
      const lastIndex = employeeIds.indexOf(rotation.lastAssignedEmployeeId);
      nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % employeeIds.length;
    }
    const nextEmployeeId = employeeIds[nextIndex];

    if (rotation) {
      await tx.leadSourceRotation.update({
        where: { id: rotation.id },
        data: { lastAssignedEmployeeId: nextEmployeeId },
      });
    } else {
      await tx.leadSourceRotation.create({
        data: { companyId, source, lastAssignedEmployeeId: nextEmployeeId },
      });
    }

    return nextEmployeeId;
  });
}
