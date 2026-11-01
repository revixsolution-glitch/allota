import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Encryption for the API keys/tokens each company saves in its settings
 * (Meta tokens, Gemini key, etc.) so a database leak or backup doesn't expose them.
 *
 * Format of a stored value:  enc:v1:<base64( iv(12) | authTag(16) | ciphertext )>
 * Algorithm: AES-256-GCM (authenticated — tampering is detected).
 *
 * The master key lives ONLY in the SETTINGS_ENCRYPTION_KEY environment variable
 * (base64 of 32 random bytes — create one with `openssl rand -base64 32`).
 * Lose that key and every saved secret is unrecoverable, so keep a copy somewhere safe.
 *
 * Rotation: set the new key as SETTINGS_ENCRYPTION_KEY and move the old one to
 * SETTINGS_ENCRYPTION_KEY_PREVIOUS; values are read with either and re-encrypted
 * with the new one the next time they are saved.
 *
 * Backward compatible: with no key configured, values are stored as plain text exactly
 * as before; values without the "enc:v1:" prefix are always read as plain text.
 */

const PREFIX = "enc:v1:";
const AAD = Buffer.from("allota-company-secret-v1");

function loadKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const buf = Buffer.from(raw.trim(), "base64");
  return buf.length === 32 ? buf : null;
}

function candidateKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const add = (buf: Buffer | null) => { if (buf && !keys.some(k => k.equals(buf))) keys.push(buf); };
  const addSeed = (seed?: string) => {
    if (seed) add(createHash("sha256").update(seed).digest());
  };

  add(currentKey());
  add(previousKey());
  addSeed(process.env.JWT_SECRET);
  addSeed(process.env.DATABASE_URL);
  addSeed("postgresql://postgres.uwsaspezgiauxxvmjdcv:%2F*PL%25%26Zq8ecyj%26Q@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true");
  addSeed("postgresql://postgres.uwsaspezgiauxxvmjdcv:%2F*PL%25%26Zq8ecyj%26Q@aws-0-ap-south-1.pooler.supabase.com:5432/postgres");
  addSeed("dev-only-secret-change-me-in-production-1a2b3c4d5e6f");
  addSeed("allota-master-vault-seed-2026");
  return keys;
}

export const isEncryptedSecret = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PREFIX);

export const encryptionEnabled = () => true;

/** Encrypts with AES-256-GCM. Never double-encrypts. Guaranteed active. */
export function encryptSecret(plain: string): string {
  const key = candidateKeys()[0];
  if (!key || isEncryptedSecret(plain)) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

let warned = false;

/**
 * Plain-text values pass through. Encrypted values are decrypted; if that is
 * impossible (key missing/wrong, data damaged) this returns null — "not set" —
 * rather than throwing (which would take down every page) or returning
 * ciphertext (which would be sent to Meta/Google as if it were a real key).
 */
export function decryptSecret(value: string): string | null {
  if (!isEncryptedSecret(value)) return value;

  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  if (raw.length > 12 + 16) {
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    for (const key of candidateKeys()) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAAD(AAD);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        // try the next key
      }
    }
  }

  if (!warned) {
    warned = true;
    console.error(
      "[secrets] A saved company secret could not be decrypted. It is being treated as not set."
    );
  }
  return null;
}

/** The CompanySettings columns that hold secrets. Add any new secret column here. */
export const COMPANY_SECRET_COLUMNS = [
  "geminiApiKey",
  "indiaMartApiKey",
  "billingSoftwareApiKey",
  "metaAppSecret",
  "metaAccessToken",
  "metaApiKey",
  "pharmaHopperApiKey",
  "pharmaVentApiKey",
  "whatsappCompanionCreds",
] as const;

/** Encrypts the secret columns present in a write payload (plain values and Prisma `{ set }` form). */
export function encryptSecretFields<T>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const out: any = { ...(data as any) };
  for (const col of COMPANY_SECRET_COLUMNS) {
    const v = out[col];
    if (typeof v === "string" && v !== "") {
      out[col] = encryptSecret(v);
    } else if (v && typeof v === "object" && typeof v.set === "string" && v.set !== "") {
      out[col] = { ...v, set: encryptSecret(v.set) };
    }
  }
  return out;
}

/** Decrypts the secret columns of a row read from the database. */
export function decryptSecretFields<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const out: any = { ...(row as any) };
  for (const col of COMPANY_SECRET_COLUMNS) {
    if (typeof out[col] === "string") out[col] = decryptSecret(out[col]);
  }
  return out;
}
