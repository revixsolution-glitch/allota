import { z } from "zod";
import { getSession } from "@/lib/auth";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";
import { generateOtp, sendOtpEmail } from "@/lib/email";

const sendOtpSchema = z.object({
  type: z.enum(["PASSWORD_UPDATE", "PASSWORD_RESET", "ACCOUNT_CREATION"]).default("PASSWORD_UPDATE"),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const body = await request.json().catch(() => ({}));
    const parsed = sendOtpSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { type } = parsed.data;
    let targetEmail = parsed.data.email?.toLowerCase().trim();
    let companyName = "Allota AI";

    if (session?.userId) {
      const db = session.companyId
        ? await getPrismaForCompany(session.companyId)
        : defaultPrisma;

      const user = await db.user.findUnique({
        where: { id: session.userId },
        include: { company: { select: { name: true } } },
      });

      if (user) {
        targetEmail = user.email.toLowerCase().trim();
        companyName = user.company?.name || companyName;
      }
    }

    if (!targetEmail) {
      return Response.json(
        { error: "Email address is required to send verification OTP." },
        { status: 400 }
      );
    }

    // Rate limit: Check if an OTP was sent in the last 45 seconds
    const recentOtp = await defaultPrisma.emailOtp.findFirst({
      where: {
        email: targetEmail,
        type,
        createdAt: { gte: new Date(Date.now() - 45 * 1000) },
      },
    });

    if (recentOtp) {
      return Response.json(
        { error: "Please wait 45 seconds before requesting another verification code." },
        { status: 429 }
      );
    }

    // Invalidate prior unused OTPs for this email and type
    await defaultPrisma.emailOtp.updateMany({
      where: { email: targetEmail, type, used: false },
      data: { used: true },
    });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await defaultPrisma.emailOtp.create({
      data: {
        email: targetEmail,
        code: otpCode,
        type,
        expiresAt,
        used: false,
      },
    });

    const emailResult = await sendOtpEmail({
      toEmail: targetEmail,
      otpCode,
      type,
      companyName,
    });

    if (!emailResult.success) {
      return Response.json(
        { error: emailResult.error || "Failed to deliver OTP email." },
        { status: 500 }
      );
    }

    // Mask email for privacy: e***d@gmail.com
    const [local, domain] = targetEmail.split("@");
    const maskedEmail =
      local.length > 2
        ? `${local[0]}${"*".repeat(local.length - 2)}${local.slice(-1)}@${domain}`
        : `${local[0]}*@${domain}`;

    return Response.json({
      success: true,
      message: `Verification code sent to ${maskedEmail}`,
      simulated: emailResult.simulated,
      // In simulation mode (no SMTP configured yet), provide code in response for testing
      debugCode: emailResult.simulated ? otpCode : undefined,
    });
  } catch (err: any) {
    console.error("[Send OTP API Error]:", err);
    return Response.json(
      { error: err?.message || "Internal server error sending OTP." },
      { status: 500 }
    );
  }
}
