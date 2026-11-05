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

/**
 * Sanitizes raw audio filenames and recorder logs into clean human-readable customer/party names.
 * Example:
 *   "Call recording Paul Medicine Raiganj Existing_261001_151004.m4a" -> "Paul Medicine Raiganj"
 *   "Call recording Rajesh Kumar Pandey - Jhumritliya Indiamart Existing_261015_112145.m4a" -> "Rajesh Kumar Pandey - Jhumritliya Indiamart"
 *   "Call recording 8240447803_260926_161109.m4a" -> "+91 82404 47803"
 */
export function cleanContactDisplayName(rawName?: string | null): string {
  if (!rawName || !rawName.trim()) {
    return "Customer / Lead";
  }

  let clean = rawName.trim();

  // 1. Strip audio file extensions (.m4a, .mp3, .wav, .aac, .ogg)
  clean = clean.replace(/\.(m4a|mp3|wav|aac|ogg)$/i, "");

  // 2. Strip recorder prefixes like 'Call recording ', 'Call_', 'recording_'
  clean = clean.replace(/^(call\s*recording\s*|call[_-]|recording[_-])/i, "");

  // 3. Strip timestamp patterns like 2026-10-31 15-49-12 or _261001_151004 or _151004
  clean = clean.replace(/[-_\s]+\d{4}[-_]\d{2}[-_]\d{2}[-_\s]+\d{2}[-_:]\d{2}[-_:]\d{2}.*$/i, "");
  clean = clean.replace(/[-_\s]+\d{2}[-_]\d{2}[-_]\d{4}[-_\s]+\d{2}[-_:]\d{2}[-_:]\d{2}.*$/i, "");
  clean = clean.replace(/[_\s]+\d{6,8}[_\s]+\d{6}.*$/i, "");
  clean = clean.replace(/_\d{6}$/i, "");

  // 4. Strip trailing or bracketed Existing / New / (E) / (N) status indicators
  clean = clean.replace(/[\s_-]+Existing(?=[\s_-]|$)/i, "");
  clean = clean.replace(/[\s_-]+\[Existing\]/i, "");
  clean = clean.replace(/[\s_-]+\(Existing\)/i, "");
  clean = clean.replace(/[\s_-]+New(?=[\s_-]|$)/i, "");
  clean = clean.replace(/[\s_-]+\(E\)/i, "");
  clean = clean.replace(/[\s_-]+\(N\)/i, "");

  // 4b. Strip channel suffixes like Facebook, Meta, Instagram, IndiaMart
  clean = clean.replace(/[\s_-]+(Facebook|Meta|Instagram|Insta|Indiamart)(?=[\s_-]|$)/i, "");

  // 5. Replace underscores with spaces
  clean = clean.replace(/_/g, " ");

  // 6. Normalize whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  // 6b. If PascalCase without spaces (e.g. ShashiBhushan -> Shashi Bhushan)
  if (!clean.includes(" ") && /[a-z][A-Z]/.test(clean)) {
    clean = clean.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  // 7. Format 10-digit phone numbers if that was the entire name
  if (/^\d{10}$/.test(clean)) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }

  if (!clean || ["recording", "call", "audio"].includes(clean.toLowerCase())) {
    return "Customer / Lead";
  }

  return clean;
}


