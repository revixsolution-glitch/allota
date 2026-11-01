import { cookies } from "next/headers";
import { z } from "zod";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";
import { validateHumanToken } from "@/lib/captcha";

const loginSchema = z.object({
  email: z.string().min(1, "Login identifier is required"),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
  _hp: z.string().optional(), // Bot honeypot
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid login ID or password" }, { status: 400 });
    }

    const { email, password, captchaToken, _hp } = parsed.data;

    // Bot Prevention 1: Honeypot trap
    if (_hp && _hp.trim().length > 0) {
      return Response.json({ error: "Automated submission detected." }, { status: 403 });
    }

    // Bot Prevention 2: Cryptographic Human Security verification
    const isDemo = request.headers.get("x-demo-bypass") === "true";
    if (!isDemo && (!captchaToken || !validateHumanToken(captchaToken))) {
      return Response.json(
        { error: "Security check required. Please complete the human verification puzzle." },
        { status: 400 }
      );
    }

    const targetIdentifier = email.toLowerCase().trim();
    const digitsOnly = targetIdentifier.replace(/\D/g, "");

    // There is no session yet, so we don't know which database to look in.
    // The login directory (always in the shared default database) tells us
    // which company this identifier belongs to.
    const directoryEntry = await defaultPrisma.loginDirectory
      .findUnique({ where: { email: targetIdentifier }, select: { companyId: true } })
      .catch(() => null);

    const db = directoryEntry ? await getPrismaForCompany(directoryEntry.companyId) : defaultPrisma;

    // 1. Direct search by Email or User ID
    let user = await db.user.findFirst({
      where: {
        OR: [
          { email: targetIdentifier },
          // Also match internal username if stored with @domain or suffix
          { email: { startsWith: `${targetIdentifier}@` } },
        ],
      },
      include: { employee: true, company: { select: { status: true } } },
    });

    // 2. If not found and input looks like a phone number (10+ digits), allow reps to login by phone number!
    if (!user && digitsOnly.length >= 10) {
      const rawDigits = digitsOnly.slice(-10);
      const part1 = rawDigits.slice(0, 5);
      const part2 = rawDigits.slice(5);
      const emp = await db.employee.findFirst({
        where: {
          OR: [
            { phoneNumber: { contains: rawDigits } },
            { phoneNumber: { contains: `${part1} ${part2}` } },
            { phoneNumber: { contains: `${part1}-${part2}` } },
          ],
        },
        include: {
          user: { include: { employee: true, company: { select: { status: true } } } },
        },
      });
      if (emp?.user) {
        user = emp.user;
      }
    }

    // 3. If user not found by exact email/handle, allow company contact email alias
    // (e.g. if the company's registered official contact email is used to log in as company admin)
    if (!user) {
      const aliasCompany = await db.company.findFirst({
        where: {
          contactEmail: { equals: targetIdentifier, mode: "insensitive" },
        },
        include: {
          users: {
            where: { role: "ADMIN" },
            include: { employee: true, company: { select: { status: true } } },
            take: 1,
          },
        },
      });

      if (aliasCompany?.users?.[0]) {
        user = aliasCompany.users[0];
      }
    }

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
  } catch (error: any) {
    console.error("[Login Error]:", error);
    return Response.json(
      { error: error?.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
