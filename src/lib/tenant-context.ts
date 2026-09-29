import { AsyncLocalStorage } from "async_hooks";

/**
 * Carries "which company is this request for" through the rest of a
 * request's async call chain, without threading a parameter through every
 * function. Set once (in `setTenantContext`, called from `getActiveCompanyId`)
 * and read anywhere downstream (by the dynamic Prisma client in `prisma.ts`).
 *
 * Node's AsyncLocalStorage propagates across `await` within one request —
 * it does NOT cross the Next.js middleware -> route boundary, so this must
 * be set inside the actual page/action/route handler, not in `proxy.ts`.
 *
 * IMPORTANT: cached on `globalThis`, exactly like the Prisma client below.
 * Next.js can bundle this same source file into more than one module
 * instance across different route chunks — without this, `auth.ts`'s copy
 * and a page/layout's copy of `storage` can end up as two disconnected
 * AsyncLocalStorage objects, so a context set in one is invisible in the
 * other. (Confirmed live: `setTenantContext` in auth.ts left `ctxNow` null
 * moments later in admin/layout.tsx, in the same request.)
 */
const globalForTenant = globalThis as unknown as {
  tenantStorage: AsyncLocalStorage<{ companyId: string | null }> | undefined;
};

const storage: AsyncLocalStorage<{ companyId: string | null }> =
  globalForTenant.tenantStorage ?? new AsyncLocalStorage();
globalForTenant.tenantStorage = storage;

export function setTenantContext(companyId: string | null) {
  const store = storage.getStore();
  if (store) {
    store.companyId = companyId;
  } else {
    // No active context yet on this async chain (first call in the request) — start one.
    storage.enterWith({ companyId });
  }
}

export function getTenantCompanyId(): string | null {
  return storage.getStore()?.companyId ?? null;
}
