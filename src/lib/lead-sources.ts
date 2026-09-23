import { LeadSource } from "@/generated/prisma/enums";

export const SOURCE_META: { value: LeadSource; label: string; icon: string }[] = [
  { value: LeadSource.META, label: "Meta Ads", icon: "🌐" },
  { value: LeadSource.INDIAMART, label: "IndiaMART", icon: "🛒" },
  { value: LeadSource.WHATSAPP, label: "WhatsApp", icon: "💬" },
  { value: LeadSource.WEBSITE, label: "Website", icon: "🖥️" },
  { value: LeadSource.SOCIAL, label: "Social", icon: "📣" },
  { value: LeadSource.MANUAL, label: "Manual Entry", icon: "✍️" },
  { value: LeadSource.EXCEL_IMPORT, label: "Excel Import", icon: "📊" },
];
