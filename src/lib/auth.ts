import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { setTenantContext } from "@/lib/tenant-context";
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
  const companyId = session.impersonatedCompanyId || session.companyId || null;
  // Re-assert the tenant-routing context every time this runs (it's already
  // called right before prisma usage throughout the app). AsyncLocalStorage's
  // `enterWith` context was empirically observed to go stale after several
  // seconds and many sequential awaits within one request on this platform
  // (confirmed live: correct right after getSession(), null again a few
  // seconds later in the same request, after ensureCompanySettingsColumns()'s
  // ~18 sequential raw SQL calls) — this call site is cheap, synchronous, and
  // already universally present immediately before the prisma calls that
  // actually need routing, so re-setting it here closes that window without
  // touching any call site.
  setTenantContext(companyId);
  return companyId;
}

/**
 * Company filter for a query. Throws instead of returning an empty filter when
 * no company is selected — an empty filter would silently return EVERY
 * company's rows. Use this (never an inline `companyId ? {...} : {}`) anywhere
 * data is read, updated or deleted on behalf of one company.
 */
export function scopeToCompany(companyId: string | null | undefined): { companyId: string } {
  if (!companyId) {
    throw new Error("No company selected — refusing to read or write across companies.");
  }
  return { companyId };
}

/** Same, for rows that belong to a company through a relation, e.g. a call's `employee`. */
export function scopeViaRelation<K extends string>(
  companyId: string | null | undefined,
  relation: K
): { [P in K]: { companyId: string } } {
  if (!companyId) {
    throw new Error("No company selected — refusing to read or write across companies.");
  }
  return { [relation]: { companyId } } as { [P in K]: { companyId: string } };
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
  }
  return session;
}
