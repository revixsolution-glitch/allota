import { NextResponse } from "next/server";
import { ensureCompanySettingsColumns } from "@/lib/db-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureCompanySettingsColumns();
    return NextResponse.json({
      success: true,
      message: "Database columns verified and synced successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
