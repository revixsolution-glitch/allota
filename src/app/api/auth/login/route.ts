import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { employee: true },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = signSession({
    userId: user.id,
    role: user.role,
    employeeId: user.employee?.id ?? null,
    companyId: user.companyId ?? null,
  });

  if (user.employee?.id) {
    await prisma.employeeSession.create({
      data: {
        employeeId: user.employee.id,
        loginTime: new Date(),
        status: "ACTIVE",
        deviceInfo: request.headers.get("user-agent") || "Android / Chrome Mobile (Field Device)",
        ipAddress: request.headers.get("x-forwarded-for") || "192.168.1.105",
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return Response.json({ role: user.role });
}
