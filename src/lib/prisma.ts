import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getTenantCompanyId } from "@/lib/tenant-context";

const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/placeholder";

function buildClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as {
  defaultPrismaClient: PrismaClient | undefined;
  tenantPrismaClients: Map<string, PrismaClient> | undefined;
};

/**
 * The default/shared database. Every existing company's data lives here,
 * and it's also where the two control tables (TenantDatabase,
 * LoginDirectory) live, so it must always be reachable with no lookup.
 */
export const defaultPrisma: PrismaClient =
  globalForPrisma.defaultPrismaClient ?? buildClient(DEFAULT_CONNECTION_STRING);

// One cached client per company that has its own database, reused across
// requests (important in a serverless/warm-lambda environment — never open
// a fresh connection pool per request).
const tenantClients: Map<string, PrismaClient> =
  globalForPrisma.tenantPrismaClients ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.defaultPrismaClient = defaultPrisma;
  globalForPrisma.tenantPrismaClients = tenantClients;
}

/** Connection string for a company's own database, or null if it uses the default one. */
async function lookupConnectionString(companyId: string): Promise<string | null> {
  try {
    const row = await defaultPrisma.tenantDatabase.findUnique({
      where: { companyId },
      select: { connectionString: true },
    });
    console.log("[tenant-debug2] lookupConnectionString", { companyId, found: Boolean(row?.connectionString) });
    return row?.connectionString ?? null;
  } catch (err) {
    // Control table not migrated yet, or lookup failed — fall back to the
    // default database rather than break the request.
    console.log("[tenant-debug2] lookupConnectionString ERROR", { companyId, err: String(err) });
    return null;
  }
}

/** Cached client for a company's own database. Exported for code that already knows the companyId (onboarding, the Meta webhook) and can't rely on request context (no session yet). */
export async function getPrismaForCompany(companyId: string): Promise<PrismaClient> {
  const cached = tenantClients.get(companyId);
  if (cached) return cached;

  const connectionString = await lookupConnectionString(companyId);
  if (!connectionString) return defaultPrisma;

  const client = buildClient(connectionString);
  tenantClients.set(companyId, client);
  return client;
}

/**
 * Makes sure a company's own client (if it has one) is cached BEFORE any
 * `prisma.*` call happens in this request. The `prisma` Proxy below only
 * does a synchronous cache read — it cannot itself do the async database
 * lookup — so whatever sets the tenant context for a request must call
 * this and await it first. `getSession()` in auth.ts does this, since it is
 * already awaited at the top of every existing page/action/route.
 */
export async function warmTenantClient(companyId: string | null): Promise<void> {
  if (!companyId || tenantClients.has(companyId)) return;
  await getPrismaForCompany(companyId);
}

/**
 * The client every existing page/action/component already imports and uses
 * as `prisma.lead.findMany(...)`, etc. Resolves to the right database for
 * whichever company is logged in for THIS request (via tenant-context),
 * with zero call-site changes needed.
 *
 * Safety net: no context set, or that company has no TenantDatabase row →
 * behaves exactly as it always has, pointed at the one shared database.
 */
export const prisma: PrismaClient = new Proxy(defaultPrisma, {
  get(defaultTarget, prop, receiver) {
    const companyId = getTenantCompanyId();
    if (prop === "company" || prop === "companySettings") {
      console.log("[tenant-debug2] proxy get", {
        prop: String(prop),
        companyId,
        isCached: companyId ? tenantClients.has(companyId) : false,
        cacheSize: tenantClients.size,
      });
    }
    if (!companyId) return Reflect.get(defaultTarget, prop, receiver);

    const cached = tenantClients.get(companyId);
    const target = cached ?? defaultTarget;
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as PrismaClient;
