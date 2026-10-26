import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptSecretFields, decryptSecretFields } from "@/lib/secret-crypto";

function sanitizeConnectionString(url?: string): string {
  if (!url) return "postgresql://postgres:postgres@localhost:5432/placeholder";
  if (url.includes(":/*PL%&Zq8ecyj&Q@")) {
    return url.replace(":/*PL%&Zq8ecyj&Q@", ":%2F*PL%25%26Zq8ecyj%26Q@");
  }
  return url;
}

const DEFAULT_CONNECTION_STRING = sanitizeConnectionString(
  process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL
);

const globalForPrisma = globalThis as unknown as {
  rawPrismaClient: PrismaClient | undefined;
  defaultPrismaClient: PrismaClient | undefined;
};

/**
 * The plain client with NO secret handling. Only for code that must see stored
 * values exactly as saved (the one-time secrets migration). Everything else
 * must use `prisma` / `defaultPrisma` below.
 */
export const rawPrisma: PrismaClient =
  globalForPrisma.rawPrismaClient ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: DEFAULT_CONNECTION_STRING }) });

/**
 * THE database. There is exactly one, shared by every company.
 *
 * Companies are kept apart by the `companyId` on every row (and by the checks
 * in the database that reject rows pointing at another company) — NOT by
 * separate databases. An earlier design routed some companies to their own
 * database through hidden request context; that context could go stale
 * mid-request, so a company's pages read an empty database or the full one.
 * It was removed on purpose. Do not reintroduce per-company database routing:
 * add a `companyId` filter (see `scopeToCompany` in `@/lib/auth`) instead.
 *
 * Company API keys/tokens are encrypted at rest: every write to
 * `companySettings` encrypts the secret columns and every read decrypts them,
 * so no call site has to remember to (see `@/lib/secret-crypto`).
 */
export const defaultPrisma: PrismaClient =
  globalForPrisma.defaultPrismaClient ??
  (rawPrisma.$extends({
    name: "company-secrets",
    query: {
      companySettings: {
        async $allOperations({ args, query }: { args: any; query: (a: any) => Promise<any> }) {
          if (args?.data) {
            args.data = Array.isArray(args.data) ? args.data.map(encryptSecretFields) : encryptSecretFields(args.data);
          }
          if (args?.create) args.create = encryptSecretFields(args.create);
          if (args?.update) args.update = encryptSecretFields(args.update);

          const result = await query(args);
          if (Array.isArray(result)) return result.map(decryptSecretFields);
          return decryptSecretFields(result);
        },
      },
    },
  }) as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.rawPrismaClient = rawPrisma;
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
