/**
 * Canonical phone normalization & extraction utilities for Allota CRM.
 * Enforces Zero-Duplicate Guarantee across Excel imports, Meta Ads webhooks,
 * manual lead entries, and batch allotments so employees never share duplicate data.
 */

function cleanRawPhone(raw: any): string {
  if (raw === null || raw === undefined) return "";
  let str = "";
  if (typeof raw === "number") {
    str = Number.isInteger(raw) ? raw.toString() : Math.round(raw).toString();
  } else {
    str = String(raw).trim();
  }
  if (!str) return "";

  // Handle scientific notation (e.g. "9.87654E+09" or "9.87654321e+09")
  if (/[eE][+-]?\d+/.test(str)) {
    const num = Number(str);
    if (!isNaN(num) && num > 0) {
      str = Math.round(num).toString();
    }
  }

  // Handle float strings like "9876543210.0" or "9876543210.00"
  if (/^\d+\.\d+$/.test(str.trim())) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = Math.round(num).toString();
    }
  }

  // Normalize all types of unicode spaces and dashes
  return str
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[—–−]/g, "-");
}

/**
 * Ultra-resilient phone number extractor for Indian and international business leads.
 * Handles:
 * - 10-digit Indian mobile numbers (starting with 6, 7, 8, or 9)
 * - Prefixes like +91, 91, 0, or 0091
 * - Meta Lead Ads export format (e.g. "p:+919876543210")
 * - Multi-number cells (e.g. "9876543210 / 9812345678", "9876543210, 9416012345")
 * - Formatted strings ("+91 98765-43210", "Dr. Rajesh (9876543210)")
 * - Raw integers, floats, and scientific notation (9876543210, 9876543210.0, 9.87654E+09)
 */
export function extractPhoneNumber(raw: any): { digits: string; formatted: string } | null {
  const cleanStr = cleanRawPhone(raw);
  if (!cleanStr) return null;

  // 1. Strip Meta prefix if present (e.g. p:+919876543210)
  const metaClean = cleanStr.replace(/^p:\s*/i, "");

  // 2. Direct check if pure digits contains Indian mobile with prefix
  const digitsOnly = metaClean.replace(/\D/g, "");

  if (digitsOnly.length === 12 && digitsOnly.startsWith("91") && /^[6-9]/.test(digitsOnly.slice(2))) {
    const ten = digitsOnly.slice(2);
    return { digits: ten, formatted: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` };
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0") && /^[6-9]/.test(digitsOnly.slice(1))) {
    const ten = digitsOnly.slice(1);
    return { digits: ten, formatted: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` };
  }
  if (digitsOnly.length === 14 && digitsOnly.startsWith("0091") && /^[6-9]/.test(digitsOnly.slice(4))) {
    const ten = digitsOnly.slice(4);
    return { digits: ten, formatted: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` };
  }
  if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
    return { digits: digitsOnly, formatted: `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}` };
  }

  // 3. If cell contains multiple numbers or mixed text (e.g. "Dr. Rahul (9876543210) / 9812345678"):
  const allTenMatch = metaClean.match(/[6-9]\d{9}/g);
  if (allTenMatch && allTenMatch.length > 0) {
    const ten = allTenMatch[0];
    return { digits: ten, formatted: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` };
  }

  // 4. Regex with separators (spaces, hyphens): e.g. "+91 98765-43210" or "098765 43210"
  const separatedMatch = metaClean.match(/(?:(?:\+|0{0,2})91[\s.-]?)?0?([6-9]\d{4}[\s.-]?\d{5})\b/);
  if (separatedMatch && separatedMatch[1]) {
    const ten = separatedMatch[1].replace(/\D/g, "");
    if (ten.length === 10) {
      return { digits: ten, formatted: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` };
    }
  }

  // 5. General 10-digit fallback
  if (digitsOnly.length === 10) {
    return { digits: digitsOnly, formatted: `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}` };
  }

  // 6. Landline / international fallback (7 to 15 digits)
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return {
      digits: digitsOnly,
      formatted: digitsOnly.startsWith("91") ? `+${digitsOnly}` : `+91 ${digitsOnly}`,
    };
  }

  return null;
}

/**
 * Extracts canonical 10-digit phone key (e.g. "9876543210").
 * Strips all prefixes (+91, 91, 0, 0091) and punctuation.
 * Always resolves identical phone numbers to the identical key.
 */
export function normalizePhoneKey(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  const parsed = extractPhoneNumber(raw);
  if (parsed) return parsed.digits;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits.length >= 7 ? digits : null;
}
