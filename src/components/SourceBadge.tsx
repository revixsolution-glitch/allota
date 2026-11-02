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
 * Renders standard CRM source badge (Meta Ads, IndiaMART, WhatsApp, Website, Sheet Import, Manual).
 * 
 * Rules:
 * 1. Do NOT mention Facebook / Instagram as a subtag for Meta Ads.
 * 2. Do NOT mention Pharmakhabar, Pharmahopers, or random external portals - outside sources count as Manual.
 * 3. If a lead is from an Excel/CSV sheet, display the sheet source cleanly.
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
  const isPharmaHopers =
    source === LeadSource.PHARMAHOPERS ||
    source === "PHARMAHOPERS" ||
    source === "PHARMA_HOPERS" ||
    source === "PHARMAHOPPER" ||
    (sourceTag || "").toLowerCase().includes("pharmahoper");
  const isPharmaKhabar =
    source === LeadSource.PHARMAKHABAR ||
    source === "PHARMAKHABAR" ||
    source === "PHARMA_KHABAR" ||
    (sourceTag || "").toLowerCase().includes("pharmakhabar");
  const isExcel = source === LeadSource.EXCEL_IMPORT || source === "EXCEL_IMPORT" || source === "SHEET";
  const isWebsite = source === LeadSource.WEBSITE || source === "WEBSITE";
  const isManual = source === LeadSource.MANUAL || source === "MANUAL";

  let label = "Manual";
  let themeClass = "bg-slate-100 text-slate-800 border-slate-300";

  if (isMeta) {
    label = "Meta Ads";
    themeClass = "bg-blue-50/80 text-blue-900 border-blue-200/80";
  } else if (isWhatsApp) {
    label = "WhatsApp";
    themeClass = "bg-emerald-50/80 text-emerald-900 border-emerald-200/80";
  } else if (isIndiaMart) {
    label = "IndiaMART";
    themeClass = "bg-amber-50/80 text-amber-900 border-amber-200/80";
  } else if (isPharmaHopers) {
    label = "PharmaHopers";
    themeClass = "bg-sky-50/90 text-sky-950 border-sky-300 shadow-xs";
  } else if (isPharmaKhabar) {
    label = "PharmaKhabar";
    themeClass = "bg-orange-50/90 text-orange-950 border-orange-300 shadow-xs";
  } else if (isExcel) {
    label = "Sheet Import";
    themeClass = "bg-emerald-50/80 text-emerald-900 border-emerald-200/80";
  } else if (isWebsite) {
    label = "Website";
    themeClass = "bg-sky-50/80 text-sky-900 border-sky-200/80";
  } else if (isManual) {
    label = "Manual";
    themeClass = "bg-slate-100 text-slate-800 border-slate-300";
  } else {
    // Outside sources are counted as Manual
    label = "Manual";
    themeClass = "bg-slate-100 text-slate-800 border-slate-300";
  }

  // Tags filter:
  // - Never mention facebook / instagram
  // - Never mention pharmakhabar or pharmahopers or manual/direct call
  // - If it's from a sheet, DO show the sheet source
  const tagLower = (sourceTag || "").trim().toLowerCase();
  const isIgnoredTag =
    !tagLower ||
    tagLower.includes("facebook") ||
    tagLower.includes("instagram") ||
    tagLower.includes("pharmakhabar") ||
    tagLower.includes("pharmahopers") ||
    tagLower === "direct call" ||
    tagLower === "manual";

  const isSheet =
    isExcel ||
    tagLower.includes("sheet") ||
    tagLower.includes(".csv") ||
    tagLower.includes(".xlsx") ||
    tagLower.includes("expo") ||
    tagLower.includes("directory") ||
    tagLower.includes("upcoming");

  const hasWhatsAppTag =
    sourceTag &&
    (sourceTag.toLowerCase().includes("whatsapp") || sourceTag.toLowerCase().includes("click-to-whatsapp"));

  const shouldShowTag = showTag && sourceTag && (!isIgnoredTag || isSheet);

  const displaySource = isPharmaHopers
    ? LeadSource.PHARMAHOPERS
    : isPharmaKhabar
    ? LeadSource.PHARMAKHABAR
    : isExcel
    ? LeadSource.EXCEL_IMPORT
    : isManual || (!isMeta && !isWhatsApp && !isIndiaMart && !isWebsite)
    ? LeadSource.MANUAL
    : (source as LeadSource);

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      {/* Official Brand Logo & Name Badge */}
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border shadow-2xs transition ${themeClass}`}
      >
        <SourceIcon source={displaySource} className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>

      {/* Clean Context Subtag (if from Sheet or valid campaign) */}
      {shouldShowTag && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/80 max-w-[140px] truncate"
          title={sourceTag || undefined}
        >
          {isSheet ? (
            <span className="text-[10px]">📄</span>
          ) : hasWhatsAppTag ? (
            <SourceIcon source={LeadSource.WHATSAPP} className="h-2.5 w-2.5 shrink-0" />
          ) : null}
          <span className="truncate">
            {sourceTag
              ?.replace(/^Meta Click-to-WhatsApp Ad\s*/i, "CTWA Ad • ")
              .replace(/^\(|\)$/g, "")}
          </span>
        </span>
      )}
    </div>
  );
}
