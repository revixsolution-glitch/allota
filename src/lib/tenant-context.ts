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
 */
const storage = new AsyncLocalStorage<{ companyId: string | null }>();

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
