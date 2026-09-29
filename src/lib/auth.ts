import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { setTenantContext, getTenantCompanyId } from "@/lib/tenant-context";
import { warmTenantClient } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export const SESSION_COOKIE = "pharma_crm_session";

export interface SessionPayload {
  userId: string;
  role: Role;
  employeeId: string | null;
  companyId: string | null;
  impersonatedCompanyId?: string | null;
}

export function getActiveCompanyId(session: SessionPayload | null): string | null {
  if (!session) return null;
  return session.impersonatedCompanyId || session.companyId || null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = verifySession(token);
  if (session) {
    // Route every `prisma.*` call for the rest of this request to this
    // company's own database, if it has one. No-op (falls back to the
    // shared default database) for every company that doesn't — which
    // today is all of them, so this changes no existing behavior.
    const activeCompanyId = getActiveCompanyId(session);
    await warmTenantClient(activeCompanyId);
    setTenantContext(activeCompanyId);
    if (true) {
      console.log("[tenant-debug] getSession routed", { activeCompanyId, ctxAfter: getTenantCompanyId() });
    }
  }
  return session;
}
