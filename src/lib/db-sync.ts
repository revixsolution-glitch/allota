import { prisma } from "@/lib/prisma";

let syncPromise: Promise<void> | null = null;

/**
 * Self-healing schema sync for the CURRENT company's database (whichever
 * one `prisma` resolves to for this request — see tenant-context.ts). Runs
 * on every admin page load, so a brand-new per-company database (or the
 * shared default one) always ends up with every column/table the deployed
 * code expects, with no manual migration step needed per company.
 */
export async function ensureCompanySettingsColumns() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const columns: Array<[string, string]> = [
      ["driveFolderUrl", "TEXT"],
      ["geminiApiKey", "TEXT"],
      ["indiaMartApiKey", "TEXT"],
      ["billingSoftwareApiKey", "TEXT"],
      ["metaAppId", "TEXT"],
      ["metaAppSecret", "TEXT"],
      ["metaAccessToken", "TEXT"],
      ["metaPageId", "TEXT"],
      ["metaAdAccountId", "TEXT"],
      ["metaWabaId", "TEXT"],
      ["metaPhoneNumberId", "TEXT"],
      ["metaApiKey", "TEXT"],
      ["whatsappCompanionCreds", "TEXT"],
      ["pharmaHopperApiKey", "TEXT"],
      ["pharmaVentApiKey", "TEXT"],
      ["enableAdsInsights", 'BOOLEAN NOT NULL DEFAULT false'],
      ["enableSocialInbox", 'BOOLEAN NOT NULL DEFAULT false'],
    ];

    for (const [col, type] of columns) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "${col}" ${type};`
        );
      } catch (err) {
        console.warn(`[DB Sync] Column check for ${col}:`, err);
      }
    }

    // Add-on feature tables — same idempotent, self-healing approach.
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AdsInsightsSync" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL UNIQUE,
          "summary" JSONB NOT NULL,
          "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastError" TEXT
        );
      `);
    } catch (err) {
      console.warn("[DB Sync] AdsInsightsSync table check:", err);
    }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SocialInboxItem" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT,
          "platform" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "externalId" TEXT NOT NULL UNIQUE,
          "fromName" TEXT,
          "fromId" TEXT,
          "text" TEXT,
          "postOrThreadId" TEXT,
          "permalink" TEXT,
          "status" TEXT NOT NULL DEFAULT 'NEW',
          "aiDraftReply" TEXT,
          "repliedText" TEXT,
          "repliedAt" TIMESTAMP(3),
          "repliedByUserId" TEXT,
          "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (err) {
      console.warn("[DB Sync] SocialInboxItem table check:", err);
    }
  })();

  return syncPromise;
}
