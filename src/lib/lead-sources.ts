import { LeadSource } from "@/generated/prisma/enums";

/** Not offered on the Core plan for now: hidden from every source picker and filter. */
export const HIDDEN_SOURCES: LeadSource[] = [LeadSource.WHATSAPP, LeadSource.SOCIAL];

export const SOURCE_META: { value: LeadSource; label: string; icon: string }[] = [
  { value: LeadSource.META, label: "Meta Ads", icon: "🌐" },
  { value: LeadSource.INDIAMART, label: "IndiaMART", icon: "🛒" },
  { value: LeadSource.WHATSAPP, label: "WhatsApp", icon: "💬" },
  { value: LeadSource.WEBSITE, label: "Website", icon: "🖥️" },
  { value: LeadSource.SOCIAL, label: "Social", icon: "📣" },
  { value: LeadSource.MANUAL, label: "Manual Entry", icon: "✍️" },
  { value: LeadSource.EXCEL_IMPORT, label: "Excel Import", icon: "📊" },
];

/** Sources an admin can pick or filter by. Use SOURCE_META only for looking up labels/icons. */
export const SELECTABLE_SOURCES = SOURCE_META.filter((s) => !HIDDEN_SOURCES.includes(s.value));
