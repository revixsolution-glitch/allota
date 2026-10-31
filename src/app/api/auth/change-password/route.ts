import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession, verifyPassword } from "@/lib/auth";
import { defaultPrisma, getPrismaForCompany } from "@/lib/prisma";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
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

    const { currentPassword, newPassword } = parsed.data;

    const db = session.companyId
      ? await getPrismaForCompany(session.companyId)
      : defaultPrisma;

    const user = await db.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return Response.json({ error: "User account not found." }, { status: 404 });
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return Response.json(
        { error: "Current password does not match. Please verify and try again." },
        { status: 400 }
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return Response.json({
      success: true,
      message: "Password changed successfully. Use your new password on next login.",
    });
  } catch (err: any) {
    console.error("[Change Password Error]:", err);
    return Response.json(
      { error: err?.message || "Failed to update password." },
      { status: 500 }
    );
  }
}
