import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/placeholder";

const globalForPrisma = globalThis as unknown as {
  defaultPrismaClient: PrismaClient | undefined;
};

/**
 * THE database. There is exactly one, shared by every company.
 *
 * Companies are kept apart by the `companyId` on every row (and by the checks
 * in the database that reject rows pointing at another company) — NOT by
 * separate databases. An earlier design routed some companies to their own
 * database through hidden request context; that context could go stale
 * mid-request, so a company's pages randomly read an empty database or the
 * full one. It was removed on purpose. Do not reintroduce per-company
 * database routing: add a `companyId` filter (see `scopeToCompany` in
 * `@/lib/auth`) instead.
 */
export const defaultPrisma: PrismaClient =
  globalForPrisma.defaultPrismaClient ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: DEFAULT_CONNECTION_STRING }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.defaultPrismaClient = defaultPrisma;
}

/** Every company uses the one shared database. Kept so existing callers keep working. */
export async function getPrismaForCompany(_companyId: string): Promise<PrismaClient> {
  return defaultPrisma;
}

/** No per-company clients exist any more, so there is nothing to warm. Kept so existing callers keep working. */
export async function warmTenantClient(_companyId: string | null): Promise<void> {}

/** The client the whole app uses (same as `defaultPrisma`). */
export const prisma: PrismaClient = defaultPrisma;
