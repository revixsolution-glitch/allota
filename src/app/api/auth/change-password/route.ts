import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession, verifyPassword } from "@/lib/auth";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  otpCode: z.string().min(4, "6-digit verification code is required"),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return Response.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, otpCode } = parsed.data;

    const db = session.companyId
      ? await getPrismaForCompany(session.companyId)
      : defaultPrisma;

    const user = await db.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return Response.json({ error: "User account not found." }, { status: 404 });
    }

    // 1. Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return Response.json(
        { error: "Current password does not match. Please verify and try again." },
        { status: 400 }
      );
    }

    // 2. Verify Email OTP
    const cleanOtp = otpCode.trim();
    const otpRecord = await defaultPrisma.emailOtp.findFirst({
      where: {
        email: user.email.toLowerCase().trim(),
        type: "PASSWORD_UPDATE",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord || otpRecord.code !== cleanOtp) {
      return Response.json(
        { error: "Invalid or expired verification code. Please request a new OTP." },
        { status: 400 }
      );
    }

    // Mark OTP as used
    await defaultPrisma.emailOtp.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    // 3. Update Password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return Response.json({
      success: true,
      message: "Password verified with OTP and updated successfully. Please use your new password next time.",
    });
  } catch (err: any) {
    console.error("[Change Password Error]:", err);
    return Response.json(
      { error: err?.message || "Failed to update password." },
      { status: 500 }
    );
  }
}
