export type PlanTier = "CORE_LEAD_SUITE" | "PREMIUM_ERP" | "CUSTOM";
export type CompanyStatus = "ACTIVE" | "TRIAL" | "SUSPENDED";

/** The Dashboard is a top-tier (Premium ERP) feature; other plans land on Lead Center. */
export function hasDashboard(planTier: string | null | undefined): boolean {
  return planTier === "PREMIUM_ERP";
}
