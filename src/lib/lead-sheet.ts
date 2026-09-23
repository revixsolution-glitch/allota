/**
 * Spreadsheet → lead parsing, shared by the upload preview (browser) and the
 * import API (server) so both always agree on what a sheet contains.
 *
 * How a sheet is understood, in order:
 *   1. Blank rows are dropped and every row is padded to the same width.
 *   2. Header row: the first row (within the top 15) that has header-like words
 *      and no phone number in it. If there is none, the sheet has NO header
 *      and every row is data (e.g. "PCD | Sulaiman | 9198… | Kochi, Kerala").
 *   3. Columns are classified by header words first, then by what the cells
 *      actually contain (phone-looking, division words, "city, state" text…),
 *      so column order and naming don't matter.
 *   4. Anything still missing is recovered per row (phone / name / division).
 */
import { extractPhoneNumber } from "@/lib/phone-utils";

export type LeadField = "name" | "phone" | "division" | "city" | "state" | "inquiry";
export const LEAD_FIELDS: LeadField[] = ["name", "phone", "division", "city", "state", "inquiry"];

/** Column index per field. `null` = no such column in this sheet. */
export type ColumnMapping = Record<LeadField, number | null>;

export interface SheetAnalysis {
  /** Data rows only (header removed), all padded to `columnCount`. */
  rows: any[][];
  hasHeader: boolean;
  /** One label per column: the header text, or "Column A" when there is none. */
  columnLabels: string[];
  mapping: ColumnMapping;
  columnCount: number;
}

export interface ParsedLead {
  name: string;
  phone: { digits: string; formatted: string };
  division: "PCD_FRANCHISE" | "THIRD_PARTY";
  city: string;
  state: string;
  inquiry: string;
}

const clean = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const norm = (v: unknown): string => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");

const DIVISION_TERMS = [
  "pcd pharma franchise", "pcd franchise", "pcd", "pharma franchise",
  "third party manufacturing", "third party", "3rd party", "contract manufacturing", "contract mfg",
  "manufacturing", "mfg", "propaganda", "franchise", "generic", "ethical",
  "ayurvedic", "herbal", "allopathic", "cosmetic", "veterinary", "derma", "cardiac", "diabetic",
];

export function isDivisionTerm(val: unknown): boolean {
  const s = clean(val).toLowerCase();
  return !!s && DIVISION_TERMS.some((t) => s === t || s.includes(t));
}

export function parseDivision(val: unknown, fallback: "PCD_FRANCHISE" | "THIRD_PARTY") {
  const s = clean(val).toLowerCase();
  if (!s) return fallback;
  if (/third|mfg|contract|3rd|party/.test(s)) return "THIRD_PARTY" as const;
  if (/pcd|franchise|propaganda|ethical/.test(s)) return "PCD_FRANCHISE" as const;
  return fallback;
}

function isLikelyName(val: unknown): boolean {
  const s = clean(val);
  if (s.length < 2 || s.length > 80) return false;
  if (extractPhoneNumber(s)) return false;
  if (/^[\d\s.,+/#-]+$/.test(s)) return false;
  if (isDivisionTerm(s)) return false;
  if (/@|https?:\/\/|\.com|\.in\b/.test(s)) return false;
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(s)) return false;
  return !["sr no", "sl no", "s no", "na", "n/a", "none", "null", "no", "yes", "true", "false", "undefined"].includes(
    s.toLowerCase()
  );
}

/** "Ernakulam, Kerala, India" style cell: 2–3 comma parts, letters only. */
function isLocationText(val: unknown): boolean {
  const s = clean(val);
  if (!s.includes(",") || s.length > 90 || /\d{4,}/.test(s)) return false;
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^[A-Za-z .&'()-]+$/.test(p));
}

const HEADER_WORDS = [
  "name", "party", "chemist", "doctor", "customer", "client", "firm", "person", "agency", "shop", "store",
  "stockist", "distributor", "dealer", "phone", "mobile", "mob", "whatsapp", "wapp", "cell", "tel", "calling",
  "contact", "city", "district", "dist", "town", "station", "location", "place", "state", "address", "hq",
  "area", "headquarter", "inquiry", "enquiry", "remark", "note", "product", "requirement", "division",
  "category", "segment", "type", "lead", "sr", "sl",
];

function columnLetter(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

/** Classify a header label into a field, or null. Order matters (phone/division before name). */
function fieldFromHeader(label: string): LeadField | null {
  const k = norm(label);
  if (!k) return null;
  if (/phone|mobile|whatsapp|wapp|cell|tel|calling/.test(k) || ["mob", "mobno", "contactno", "contactnumber", "wa"].includes(k)) return "phone";
  if (/type|division|category|segment|franchise|manufactur|mfg|nature|business|propaganda/.test(k) || k === "pcd") return "division";
  if (/inquiry|enquiry|remark|note|requirement|product|detail|comment|message|description/.test(k)) return "inquiry";
  if (/city|district|dist|town|station|location|place|hq|headquarter|territory|area|address/.test(k)) return "city";
  if (/state|province|region|zone/.test(k)) return "state";
  if (/name|party|chemist|doctor|customer|client|firm|agency|person|prospect|applicant|shop|store|stockist|distributor|dealer/.test(k) || k === "lead" || k === "contact") return "name";
  return null;
}

export function analyzeSheet(aoa: any[][]): SheetAnalysis {
  const nonEmpty = aoa.filter((r) => Array.isArray(r) && r.some((c) => clean(c) !== ""));
  const columnCount = nonEmpty.reduce((m, r) => Math.max(m, r.length), 0);
  const padded = nonEmpty.map((r) => Array.from({ length: columnCount }, (_, i) => r[i] ?? ""));

  // 1. Header row: header-like words and no phone number.
  let headerIdx = -1;
  let best = 0;
  for (let r = 0; r < Math.min(padded.length, 15); r++) {
    const row = padded[r];
    if (row.some((c) => extractPhoneNumber(c))) continue;
    const hits = row.filter((c) => {
      const k = norm(c);
      return k && k.length <= 40 && HEADER_WORDS.some((w) => k.includes(w));
    }).length;
    if (hits > best) {
      best = hits;
      headerIdx = r;
    }
  }
  const hasHeader = headerIdx >= 0 && best >= 1;
  const rows = hasHeader ? padded.slice(headerIdx + 1) : padded;
  const columnLabels = Array.from({ length: columnCount }, (_, i) =>
    hasHeader && clean(padded[headerIdx][i]) ? clean(padded[headerIdx][i]) : `Column ${columnLetter(i)}`
  );

  const mapping: ColumnMapping = { name: null, phone: null, division: null, city: null, state: null, inquiry: null };
  const taken = new Set<number>();
  const assign = (f: LeadField, i: number) => {
    if (mapping[f] === null && !taken.has(i)) {
      mapping[f] = i;
      taken.add(i);
    }
  };

  // 2. By header words.
  if (hasHeader) {
    columnLabels.forEach((label, i) => {
      const f = fieldFromHeader(label);
      if (f) assign(f, i);
    });
  }

  // 3. By content, for whatever is still unassigned (sample up to 300 rows).
  const sample = rows.slice(0, 300);
  const ratio = (i: number, test: (v: unknown) => boolean) => {
    const filled = sample.map((r) => r[i]).filter((v) => clean(v) !== "");
    return filled.length ? filled.filter(test).length / filled.length : 0;
  };
  const pickBest = (test: (v: unknown) => boolean, min = 0.6): number | null => {
    let bestI: number | null = null;
    let bestR = min - 0.0001;
    for (let i = 0; i < columnCount; i++) {
      if (taken.has(i)) continue;
      const r = ratio(i, test);
      if (r > bestR) {
        bestR = r;
        bestI = i;
      }
    }
    return bestI;
  };

  if (mapping.phone === null) {
    const i = pickBest((v) => !!extractPhoneNumber(v));
    if (i !== null) assign("phone", i);
  }
  if (mapping.division === null) {
    const i = pickBest(isDivisionTerm);
    if (i !== null) assign("division", i);
  }
  if (mapping.city === null && mapping.state === null) {
    const i = pickBest(isLocationText, 0.5);
    if (i !== null) assign("city", i); // split into city + state per row
  }
  if (mapping.name === null) {
    const i = pickBest(isLikelyName, 0.6);
    if (i !== null) assign("name", i);
  }
  if (mapping.inquiry === null) {
    // Longest remaining free-text column.
    let bestI: number | null = null;
    let bestLen = 24; // must average longer than a name/location to count as notes
    for (let i = 0; i < columnCount; i++) {
      if (taken.has(i)) continue;
      const vals = sample.map((r) => clean(r[i])).filter(Boolean);
      if (!vals.length) continue;
      const avg = vals.reduce((s, v) => s + v.length, 0) / vals.length;
      if (avg > bestLen) {
        bestLen = avg;
        bestI = i;
      }
    }
    if (bestI !== null) assign("inquiry", bestI);
  }

  return { rows, hasHeader, columnLabels, mapping, columnCount };
}

/**
 * Turn one row into a lead, or null when it has no usable phone number.
 * `mapping` may be the auto-detected one or the user's override.
 */
export function extractLead(
  row: any[],
  mapping: ColumnMapping,
  defaultDivision: "PCD_FRANCHISE" | "THIRD_PARTY"
): ParsedLead | null {
  const cell = (f: LeadField) => (mapping[f] === null ? "" : clean(row[mapping[f] as number]));

  // Phone: mapped column, else any cell in the row that looks like a phone.
  let phone = extractPhoneNumber(cell("phone"));
  let phoneCell = phone ? cell("phone") : "";
  if (!phone) {
    for (const c of row) {
      const p = extractPhoneNumber(c);
      if (p) {
        phone = p;
        phoneCell = clean(c);
        break;
      }
    }
  }
  if (!phone) return null;

  // Division: mapped column, else any cell containing a division word.
  let division = defaultDivision;
  const divCell = cell("division");
  if (divCell) division = parseDivision(divCell, defaultDivision);
  else {
    const hit = row.find((c) => isDivisionTerm(c));
    if (hit) division = parseDivision(hit, defaultDivision);
  }

  let city = cell("city");
  let state = cell("state");
  if (city.includes(",")) {
    // "Ernakulam, Kerala, India" → city + state (country dropped).
    const parts = city.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length && /^india$/i.test(parts[parts.length - 1])) parts.pop();
    city = parts[0] ?? "";
    if (!state && parts.length > 1) state = parts.slice(1).join(", ");
  }

  // Name: mapped column if it really looks like a name, else first name-like cell.
  let name = isLikelyName(cell("name")) ? cell("name") : "";
  if (!name) {
    name =
      row.map(clean).find((v) => v && v !== phoneCell && v !== city && v !== state && isLikelyName(v) && !isLocationText(v)) ??
      "";
  }

  return { name, phone, division, city, state, inquiry: cell("inquiry") };
}
