import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptSecretFields, decryptSecretFields } from "@/lib/secret-crypto";

const SUPABASE_CONNECTION_STRING =
  "postgresql://postgres.uwsaspezgiauxxvmjdcv:%2F*PL%25%26Zq8ecyj%26Q@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

// Cleanse residual Neon environment variables from process.env
for (const key of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL"]) {
  if (process.env[key]?.includes("neon.tech") || process.env[key]?.includes("snowy-paper")) {
    delete process.env[key];
  }
}

function resolveConnectionString(): string {
  const envUrl = process.env.DATABASE_URL;
  // If envUrl is missing or still pointing to exhausted Neon database, fallback directly to Supabase
  if (!envUrl || envUrl.includes("neon.tech") || envUrl.includes("snowy-paper")) {
    return SUPABASE_CONNECTION_STRING;
  }
  if (envUrl.includes(":/*PL%&Zq8ecyj&Q@")) {
    return envUrl.replace(":/*PL%&Zq8ecyj&Q@", ":%2F*PL%25%26Zq8ecyj%26Q@");
  }
  return envUrl;
}

const DEFAULT_CONNECTION_STRING = resolveConnectionString();

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
