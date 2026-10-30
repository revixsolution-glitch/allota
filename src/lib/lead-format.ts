/**
 * Formats lead inquiry notes and details for UI display.
 * Strips internal technical tracking identifiers (e.g. WhatsApp LID masking headers)
 * so sales representatives and administrators see clean, readable customer inquiries.
 */
export function formatInquiryDetails(raw?: string | null): string {
  if (!raw) return "Inquiry received";

  let text = raw.trim();

  // Strip technical WhatsApp LID mask e.g. [LID: 199999530991826@lid]
  text = text.replace(/\[LID:[^\]]+\]\s*/gi, "").trim();

  // Strip technical contact sync notification lines
  text = text.replace(/\[Real Phone Disclosed via WhatsApp Contact Sync\]:[^\n]+\n?/gi, "").trim();

  // If after stripping it's empty, provide fallback
  return text || "Inquiry received";
}
