import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rawPrisma } from "@/lib/prisma";
import { encryptionEnabled } from "@/lib/secret-crypto";
import { encryptExistingSecrets, getSecretStatus } from "@/lib/secret-migration";

export const dynamic = "force-dynamic";

async function isSuperAdmin() {
  const session = await getSession();
  return Boolean(session && session.role === "SUPER_ADMIN");
}

/** Status only: counts of plain-text vs encrypted secrets. Never returns a secret's value. */
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getSecretStatus(rawPrisma));
}

/** One-time, repeatable: encrypts every secret still saved as plain text. Requires the master key. */
export async function POST() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!encryptionEnabled()) {
    return NextResponse.json(
      { error: "Set SETTINGS_ENCRYPTION_KEY (base64 of 32 random bytes) in the environment first, then redeploy." },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true, ...(await encryptExistingSecrets(rawPrisma)) });
}
