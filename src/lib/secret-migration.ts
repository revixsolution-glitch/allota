import type { PrismaClient } from "@/generated/prisma/client";
import {
  COMPANY_SECRET_COLUMNS,
  decryptSecret,
  encryptSecret,
  encryptionEnabled,
  isEncryptedSecret,
} from "@/lib/secret-crypto";

/** Counts only — never returns a secret's value. `client` must be the unencrypted client (rawPrisma). */
export async function getSecretStatus(client: PrismaClient) {
  const rows = await client.companySettings.findMany();
  let plaintext = 0;
  let encrypted = 0;
  let unreadable = 0;
  for (const row of rows) {
    for (const col of COMPANY_SECRET_COLUMNS) {
      const v = (row as Record<string, unknown>)[col];
      if (typeof v !== "string" || v === "") continue;
      if (!isEncryptedSecret(v)) plaintext++;
      else if (decryptSecret(v) === null) unreadable++;
      else encrypted++;
    }
  }
  return {
    encryptionConfigured: encryptionEnabled(),
    settingsRows: rows.length,
    secretsPlaintext: plaintext,
    secretsEncrypted: encrypted,
    secretsUnreadable: unreadable,
  };
}

/**
 * Encrypts every secret still saved as plain text. Each value is checked to decrypt back to
 * exactly the original BEFORE it is written, so a failure can never replace a good secret with an
 * unreadable one. Safe to run repeatedly. `client` must be the unencrypted client (rawPrisma).
 */
export async function encryptExistingSecrets(client: PrismaClient) {
  const rows = await client.companySettings.findMany();
  let encrypted = 0;
  let alreadyEncrypted = 0;
  let skippedFailedCheck = 0;
  let rowsChanged = 0;

  for (const row of rows) {
    const updates: Record<string, string> = {};
    for (const col of COMPANY_SECRET_COLUMNS) {
      const v = (row as Record<string, unknown>)[col];
      if (typeof v !== "string" || v === "") continue;
      if (isEncryptedSecret(v)) {
        alreadyEncrypted++;
        continue;
      }
      const enc = encryptSecret(v);
      if (decryptSecret(enc) !== v) {
        skippedFailedCheck++;
        continue;
      }
      updates[col] = enc;
      encrypted++;
    }
    if (Object.keys(updates).length > 0) {
      await client.companySettings.update({ where: { id: row.id }, data: updates });
      rowsChanged++;
    }
  }

  return {
    settingsRows: rows.length,
    rowsChanged,
    secretsEncrypted: encrypted,
    secretsAlreadyEncrypted: alreadyEncrypted,
    secretsSkippedFailedCheck: skippedFailedCheck,
  };
}
