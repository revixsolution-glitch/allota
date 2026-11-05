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

/**
 * Formats lead and prospect names for clean UI display.
 * Ensures names always have proper spaces between words:
 * - If a name was entered or imported without spaces in PascalCase / CamelCase
 *   (e.g. "ShashiBhushan", "RajeevVaidya", "VineetKumar", "RahulPatel"),
 *   it splits it into clean separate words ("Shashi Bhushan", "Rajeev Vaidya").
 * - Preserves existing spaces and trims extra whitespace.
 */
export function formatLeadName(rawName?: string | null): string {
  if (!rawName) return "";
  let name = String(rawName).trim();
  if (!name) return "";

  // If the name does NOT contain spaces, but has lowercase followed by uppercase (PascalCase/camelCase)
  // e.g. "ShashiBhushan" -> "Shashi Bhushan", "RajeevVaidya" -> "Rajeev Vaidya"
  if (!name.includes(" ") && /[a-z][A-Z]/.test(name)) {
    name = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  // Handle prefix like "Dr.Rajeev" -> "Dr. Rajeev"
  name = name.replace(/^(Dr|Mr|Mrs|Ms)\.([A-Za-z])/i, "$1. $2");

  // Normalize multiple spaces into a single space
  return name.replace(/\s+/g, " ");
}
