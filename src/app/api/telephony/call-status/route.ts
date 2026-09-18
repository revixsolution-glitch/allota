import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const callId = searchParams.get("callId");

    if (!callId) {
      return NextResponse.json({ error: "Missing callId" }, { status: 400 });
    }

    const formData = await req.formData();
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;

    const durationSec = callDuration ? parseInt(callDuration, 10) : 0;
    const isMissed = callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed";

    await prisma.call.update({
      where: { id: callId },
      data: {
        durationSec: durationSec || (isMissed ? 0 : 60),
        missed: isMissed,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Call status callback error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
