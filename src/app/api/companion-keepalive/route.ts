import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 24/7 Keep-Alive Cron Endpoint
 * Pings the persistent Render WhatsApp Companion service every 5 minutes
 * to prevent it from ever sleeping or spinning down on the free tier.
 */
export async function GET() {
  const companionUrl = (
    process.env.COMPANION_SERVICE_URL || "https://allota-whatsapp-companion.onrender.com"
  ).replace(/\/$/, "");

  try {
    const res = await fetch(`${companionUrl}/health`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      pingedAt: new Date().toISOString(),
      status: "AWAKE_24_7",
      companion: data,
    });
  } catch (err: any) {
    console.warn("[Keep-Alive Cron] Ping warning:", err?.message);
    return NextResponse.json({
      success: false,
      error: err?.message || "Failed to reach companion service",
    }, { status: 502 });
  }
}
