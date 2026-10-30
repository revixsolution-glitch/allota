import React from "react";
import { LeadSource } from "@/generated/prisma/enums";
import { SourceIcon } from "@/components/SourceIcon";

interface SourceBadgeProps {
  source: LeadSource | string;
  sourceTag?: string | null;
  className?: string;
  showTag?: boolean;
}

/**
 * Renders the official brand logo (Meta, WhatsApp, IndiaMART, Excel) alongside
 * a clean, stylized source badge for desktop tables and mobile cards.
 */
export function SourceBadge({
  source,
  sourceTag,
  className = "",
  showTag = true,
}: SourceBadgeProps) {
  const isMeta = source === LeadSource.META || source === "META";
  const isWhatsApp = source === LeadSource.WHATSAPP || source === "WHATSAPP";
  const isIndiaMart = source === LeadSource.INDIAMART || source === "INDIAMART";
  const isExcel = source === LeadSource.EXCEL_IMPORT || source === "EXCEL_IMPORT";
  const isWebsite = source === LeadSource.WEBSITE || source === "WEBSITE";
  const isManual = source === LeadSource.MANUAL || source === "MANUAL";

  let label = String(source);
  let themeClass = "bg-slate-50 text-slate-800 border-slate-200";

  if (isMeta) {
    label = "Meta Ads";
    themeClass = "bg-blue-50/80 text-blue-900 border-blue-200/80";
  } else if (isWhatsApp) {
    label = "WhatsApp";
    themeClass = "bg-emerald-50/80 text-emerald-900 border-emerald-200/80";
  } else if (isIndiaMart) {
    label = "IndiaMART";
    themeClass = "bg-amber-50/80 text-amber-900 border-amber-200/80";
  } else if (isExcel) {
    label = "Excel Import";
    themeClass = "bg-emerald-50/80 text-emerald-900 border-emerald-200/80";
  } else if (isWebsite) {
    label = "Website";
    themeClass = "bg-sky-50/80 text-sky-900 border-sky-200/80";
  } else if (isManual) {
    label = "Direct Call";
    themeClass = "bg-slate-100 text-slate-800 border-slate-300";
  }

  const hasWhatsAppTag =
    sourceTag &&
    (sourceTag.toLowerCase().includes("whatsapp") || sourceTag.toLowerCase().includes("click-to-whatsapp"));

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      {/* Official Brand Logo & Name Badge */}
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border shadow-2xs transition ${themeClass}`}
      >
        <SourceIcon source={source as LeadSource} className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>

      {/* Clean Context Subtag (if available) */}
      {showTag && sourceTag && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/70 max-w-[140px] truncate"
          title={sourceTag}
        >
          {hasWhatsAppTag && <SourceIcon source={LeadSource.WHATSAPP} className="h-2.5 w-2.5 shrink-0" />}
          <span className="truncate">
            {sourceTag
              .replace(/^Meta Click-to-WhatsApp Ad\s*/i, "CTWA Ad • ")
              .replace(/^\(|\)$/g, "")}
          </span>
        </span>
      )}
    </div>
  );
}
