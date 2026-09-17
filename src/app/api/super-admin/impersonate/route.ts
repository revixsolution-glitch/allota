import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession, signSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Unauthorized. Super Admin role required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;

  if (!companyId || typeof companyId !== "string") {
    return Response.json({ error: "companyId is required." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    return Response.json({ error: "Company not found." }, { status: 404 });
  }

  // Generate new session token with impersonatedCompanyId
  const token = signSession({
    userId: session.userId,
    role: "SUPER_ADMIN",
    employeeId: null,
    companyId: null,
    impersonatedCompanyId: company.id,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return Response.json({ success: true, redirect: "/admin" });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Unauthorized. Super Admin role required." }, { status: 403 });
  }

  // Clear impersonation token
  const token = signSession({
    userId: session.userId,
    role: "SUPER_ADMIN",
    employeeId: null,
    companyId: null,
    impersonatedCompanyId: null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return Response.json({ success: true, redirect: "/super-admin" });
}
