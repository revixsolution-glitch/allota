import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // 1. Asynchronously log session end without blocking the HTTP response
  getSession().then(async (session) => {
    if (session?.employeeId) {
      try {
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
      } catch (err) {
        console.warn("Background session logout record error:", err);
      }
    }
  }).catch(() => {});

  // 2. Clear cookie from Next.js server store
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // 3. Check if requested via fetch/AJAX
  const acceptHeader = req.headers.get("accept") || "";
  const isAjax =
    req.headers.get("x-requested-with") === "XMLHttpRequest" ||
    (acceptHeader.includes("application/json") && !acceptHeader.includes("text/html"));

  const response = isAjax
    ? NextResponse.json({ ok: true, redirected: true, url: "/login" })
    : NextResponse.redirect(new URL("/login", req.nextUrl?.origin || req.url), { status: 303 });

  // 4. Force Set-Cookie header in HTTP response to guarantee browser purge
  response.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
