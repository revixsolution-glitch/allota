export function craftAiWhatsAppMissedMessage({
  leadName,
  repName,
  companyName,
  division,
  territory,
}: {
  leadName?: string | null;
  repName?: string | null;
  companyName?: string | null;
  division?: string | null;
  territory?: string | null;
}) {
  const name = leadName?.trim() || "Sir/Madam";
  const rep = repName?.trim() || "Our Sales Team";
  const company = companyName?.trim() || "Allota AI";
  const div = division === "THIRD_PARTY" ? "Third-Party Pharma Manufacturing" : "PCD Pharma Franchise";
  const area = territory?.trim() ? ` for ${territory}` : "";

  return `Hello ${name},\n\nThis is ${rep} from ${company}.\n\nWe just tried reaching you regarding your inquiry for ${div}${area}. Sorry we missed you!\n\nPlease let us know a convenient time to speak, or feel free to reply here with your product requirements and district details.\n\nLooking forward to collaborating with you.\n\nBest regards,\n${rep}\n${company}`;
}

export type LeadCategory = "HOT" | "WARM" | "COLD" | "DEAD";

export interface LeadClassification {
  category: LeadCategory;
  label: string;
  badgeClass: string;
  pillClass: string;
  reason: string;
}

export function classifyCallLead(call: {
  transcript?: string | null;
  aiSummary?: string | null;
  summary?: string | null;
  behaviorTags?: string[];
  missed?: boolean;
  durationSec?: number;
}): LeadClassification {
  const tags = call.behaviorTags || [];
  const tagsLower = tags.map((t) => t.toLowerCase());
  const combinedText = `${call.aiSummary || ""} ${call.summary || ""} ${call.transcript || ""}`.toLowerCase();

  // 1. Explicit tag overrides
  if (tagsLower.some((t) => t.includes("hot lead") || t.includes("🔥"))) {
    return {
      category: "HOT",
      label: "🔥 Hot Lead",
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
      pillClass: "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-xs",
      reason: "High commercial intent: pricing/catalog requested, monopoly district inquired, or order booked.",
    };
  }

  if (tagsLower.some((t) => t.includes("warm lead") || t.includes("⚡"))) {
    return {
      category: "WARM",
      label: "⚡ Warm Lead",
      badgeClass: "bg-amber-50 text-amber-800 border border-amber-200",
      pillClass: "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs",
      reason: "Active interest: inquired about PCD pharma franchise, products, or territory availability.",
    };
  }

  if (tagsLower.some((t) => t.includes("cold lead") || t.includes("❄️"))) {
    return {
      category: "COLD",
      label: "❄️ Cold Lead",
      badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
      pillClass: "bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-xs",
      reason: "Low immediate interest: prospect asked to follow up later or was price hesitant.",
    };
  }

  if (
    tagsLower.some(
      (t) =>
        t.includes("dead lead") ||
        t.includes("💀") ||
        t.includes("mic test") ||
        t.includes("testing") ||
        t.includes("personal") ||
        t.includes("no commercial") ||
        t.includes("audio insufficient")
    )
  ) {
    return {
      category: "DEAD",
      label: "💀 Dead Lead",
      badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
      pillClass: "bg-slate-600 text-white shadow-xs",
      reason: "No commercial inquiry: audio test, personal call, or call was not connected.",
    };
  }

  // 2. Unanswered / missed calls
  if (call.missed) {
    return {
      category: "DEAD",
      label: "📵 Unanswered",
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
      pillClass: "bg-rose-600 text-white shadow-xs",
      reason: "Outbound call was not answered by the customer. Queued for WhatsApp recovery.",
    };
  }

  // 3. Transcript & summary heuristic analysis
  if (
    combinedText.includes("mic testing") ||
    combinedText.includes("testing testing") ||
    combinedText.includes("aaloota") ||
    combinedText.includes("aa loota") ||
    combinedText.includes("kya haal chaal") ||
    combinedText.includes("microwave") ||
    combinedText.includes("shopping") ||
    combinedText.includes("no commercial discussion") ||
    (call.durationSec !== undefined && call.durationSec < 10 && !combinedText.includes("pcd"))
  ) {
    return {
      category: "DEAD",
      label: "💀 Dead Lead",
      badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
      pillClass: "bg-slate-600 text-white shadow-xs",
      reason: "No commercial value: mic test, brief audio check, or personal non-pharma conversation.",
    };
  }

  if (
    combinedText.includes("order book") ||
    combinedText.includes("order confirmed") ||
    combinedText.includes("excel") ||
    combinedText.includes("price list") ||
    combinedText.includes("rate list") ||
    combinedText.includes("monopoly") ||
    combinedText.includes("bhopal") ||
    combinedText.includes("gorakhpur") ||
    combinedText.includes("proforma") ||
    combinedText.includes("strips") ||
    combinedText.includes("bechte ho") ||
    combinedText.includes("hot lead")
  ) {
    return {
      category: "HOT",
      label: "🔥 Hot Lead",
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
      pillClass: "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-xs",
      reason: "High buying intent: territory monopoly, catalog, or pricing requested.",
    };
  }

  if (
    combinedText.includes("pcd") ||
    combinedText.includes("franchise") ||
    combinedText.includes("up mein") ||
    combinedText.includes("uttar pradesh") ||
    combinedText.includes("product list") ||
    combinedText.includes("catalog") ||
    combinedText.includes("inquiry") ||
    combinedText.includes("doctor")
  ) {
    return {
      category: "WARM",
      label: "⚡ Warm Lead",
      badgeClass: "bg-amber-50 text-amber-800 border border-amber-200",
      pillClass: "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs",
      reason: "Active interest: customer asked about PCD pharma franchise or product availability.",
    };
  }

  return {
    category: "COLD",
    label: "❄️ Cold Lead",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    pillClass: "bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-xs",
    reason: "General contact: no immediate buying intent or district monopoly requested.",
  };
}

