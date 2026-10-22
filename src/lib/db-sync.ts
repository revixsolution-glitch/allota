import { prisma } from "@/lib/prisma";
import path from "node:path";
import fs from "node:fs";

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
      ["whatsappConnected", 'BOOLEAN NOT NULL DEFAULT false'],
      ["whatsappCompanionPhone", "TEXT"],
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

    // Auto-sync active WhatsApp companion status if creds exist
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "CompanySettings"
        SET "whatsappConnected" = true
        WHERE ("whatsappCompanionCreds" LIKE '%"registered":true%' OR "whatsappCompanionCreds" LIKE '%"registered": true%')
          AND "whatsappConnected" = false;
      `);
    } catch {}

    // Auto-sync host daemon credentials to default company if available
    try {
      const defaultCredsPath = path.join(process.cwd(), "tmp", "whatsapp_auth_test", "creds.json");
      if (fs.existsSync(defaultCredsPath)) {
        const credsRaw = fs.readFileSync(defaultCredsPath, "utf8");
        const creds = JSON.parse(credsRaw);
        if (creds?.registered && creds?.me?.id) {
          const phone = creds.me.id.split(":")[0];
          await prisma.$executeRawUnsafe(`
            UPDATE "CompanySettings"
            SET "whatsappConnected" = true,
                "whatsappCompanionPhone" = COALESCE("whatsappCompanionPhone", '${phone}')
            WHERE "id" = 'default' OR "companyId" IS NULL;
          `);
        }
      }
    } catch {}

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
          "postTitle" TEXT,
          "postThumbnail" TEXT,
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

      // Add postTitle, postThumbnail, mediaType, isAd, adCampaignName if table already existed
      await prisma.$executeRawUnsafe(`ALTER TABLE "SocialInboxItem" ADD COLUMN IF NOT EXISTS "postTitle" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "SocialInboxItem" ADD COLUMN IF NOT EXISTS "postThumbnail" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "SocialInboxItem" ADD COLUMN IF NOT EXISTS "mediaType" TEXT DEFAULT 'POST';`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "SocialInboxItem" ADD COLUMN IF NOT EXISTS "isAd" BOOLEAN NOT NULL DEFAULT false;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "SocialInboxItem" ADD COLUMN IF NOT EXISTS "adCampaignName" TEXT;`);
    } catch (err) {
      console.warn("[DB Sync] SocialInboxItem table check:", err);
    }
  })();

  return syncPromise;
}
