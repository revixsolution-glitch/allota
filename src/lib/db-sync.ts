import { prisma } from "@/lib/prisma";

let syncPromise: Promise<void> | null = null;

export async function ensureCompanySettingsColumns() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const columns = [
      "driveFolderUrl",
      "indiaMartApiKey",
      "billingSoftwareApiKey",
      "metaApiKey",
      "pharmaHopperApiKey",
      "pharmaVentApiKey",
    ];

    for (const col of columns) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`
        );
      } catch (err) {
        console.warn(`[DB Sync] Column check for ${col}:`, err);
      }
    }
  })();

  return syncPromise;
}
