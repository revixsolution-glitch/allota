import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
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
  } catch (err) {
    console.warn("Error updating session on logout:", err);
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);

  // Check if requested via fetch/AJAX
  const acceptHeader = req.headers.get("accept") || "";
  const isAjax =
    req.headers.get("x-requested-with") === "XMLHttpRequest" ||
    (acceptHeader.includes("application/json") && !acceptHeader.includes("text/html"));

  if (isAjax) {
    return NextResponse.json({ ok: true, redirected: true, url: "/login" });
  }

  const origin = req.nextUrl?.origin || "https://allota.in";
  return NextResponse.redirect(new URL("/login", origin), { status: 303 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
