import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (session?.employeeId) {
    const activeSession = await prisma.employeeSession.findFirst({
      where: { employeeId: session.employeeId, status: "ACTIVE" },
      orderBy: { loginTime: "desc" },
    });
    if (activeSession) {
      const now = new Date();
      const diffHours = Number(
        ((now.getTime() - activeSession.loginTime.getTime()) / (1000 * 60 * 60)).toFixed(2)
      );
      await prisma.employeeSession.update({
        where: { id: activeSession.id },
        data: {
          logoutTime: now,
          workingHours: Math.max(0.1, diffHours),
          status: "COMPLETED",
        },
      });
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
