"use client";

import { useState, useTransition } from "react";
import { updateCompanyPlanTier } from "@/lib/super-admin-actions";
import type { PlanTier } from "@/types/company";

export function PlanTierSelect({
  companyId,
  initialPlanTier,
}: {
  companyId: string;
  initialPlanTier: PlanTier | string;
}) {
  const [currentTier, setCurrentTier] = useState<PlanTier>(
    (initialPlanTier as PlanTier) || "CORE_LEAD_SUITE"
  );
  const [isPending, startTransition] = useTransition();

  function handleChange(newTier: PlanTier) {
    setCurrentTier(newTier);
    startTransition(async () => {
      await updateCompanyPlanTier(companyId, newTier);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={currentTier}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value as PlanTier)}
        className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
      >
        <option value="CORE_LEAD_SUITE">Core Lead Suite (₹0 Marg)</option>
        <option value="PREMIUM_ERP">Premium ERP Plan (With Billing)</option>
      </select>
      {isPending && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}
    </div>
  );
}
