import React from "react";

interface CategoryBadgeProps {
  division?: string | null;
  businessType?: string | null;
  className?: string;
}

/**
 * Standardized Category / Division Badge across the CRM.
 * Renders compact stacked 2-line curved badge (Third- / Party vs PCD / Franchise).
 * Same 10px font size, same purple/blue curved background.
 */
export function CategoryBadge({
  division,
  businessType,
  className = "",
}: CategoryBadgeProps) {
  const isThirdParty =
    division === "THIRD_PARTY" ||
    businessType === "THIRD_PARTY" ||
    (division || "").toUpperCase().includes("THIRD");

  if (isThirdParty) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-800 leading-tight shrink-0 select-none ${className}`}
      >
        <span className="text-xs">🏭</span>
        <span className="inline-flex flex-col text-left leading-[1.1]">
          <span>Third-</span>
          <span>Party</span>
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 leading-tight shrink-0 select-none ${className}`}
    >
      <span className="text-xs">🏢</span>
      <span className="inline-flex flex-col text-left leading-[1.1]">
        <span>PCD</span>
        <span>Franchise</span>
      </span>
    </span>
  );
}
