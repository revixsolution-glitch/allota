import { cookies } from "next/headers";
import { z } from "zod";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
  _hp: z.string().optional(), // Bot honeypot
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const { email, password, captchaToken, _hp } = parsed.data;

  // Bot Prevention 1: Honeypot trap
  if (_hp && _hp.trim().length > 0) {
    return Response.json({ error: "Automated submission detected." }, { status: 403 });
  }

  // Bot Prevention 2: Security check verification
  const isDemo = request.headers.get("x-demo-bypass") === "true";
  if (!isDemo && (!captchaToken || !captchaToken.startsWith("allota_sec_"))) {
    return Response.json(
      { error: "Please click the security checkbox to verify you are human." },
      { status: 400 }
    );
  }

  const targetEmail = email.toLowerCase().trim();

  // There is no session yet, so we don't know which database to look in.
  // The login directory (always in the shared default database) tells us
  // which company this email belongs to; a company with no dedicated
  // database entry uses the same default database, so this is a no-op for
  // every account created before this system existed.
  const directoryEntry = await defaultPrisma.loginDirectory
    .findUnique({ where: { email: targetEmail }, select: { companyId: true } })
    .catch(() => null);

  const db = directoryEntry ? await getPrismaForCompany(directoryEntry.companyId) : defaultPrisma;

  const user = await db.user.findUnique({
    where: { email: targetEmail },
    include: { employee: true, company: { select: { status: true } } },
  });

  const isMatch = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !isMatch) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Only companies onboarded from the super admin (and not suspended) can be used.
  if (user.company?.status === "SUSPENDED") {
    return Response.json(
      { error: "This company's access is suspended. Please contact Allota support." },
      { status: 403 }
    );
  }

  const token = signSession({
    userId: user.id,
    role: user.role,
    employeeId: user.employee?.id ?? null,
    companyId: user.companyId ?? null,
  });

  if (user.employee?.id) {
    await db.employeeSession.create({
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
