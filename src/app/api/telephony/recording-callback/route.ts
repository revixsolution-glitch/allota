import { NextRequest, NextResponse } from "next/server";
import { transcribeAndSummarizeCall } from "@/lib/telephony";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const callId = searchParams.get("callId");

    const formData = await req.formData();
    const recordingUrl = formData.get("RecordingUrl") as string;
    const recordingDuration = formData.get("RecordingDuration") as string;

    if (!callId || !recordingUrl) {
      return NextResponse.json({ error: "Missing callId or recordingUrl" }, { status: 400 });
    }

    // Process AI transcription and summarization in the background
    transcribeAndSummarizeCall({
      callId,
      recordingUrl,
    }).catch((err) => console.error("Async transcribe error:", err));

    return NextResponse.json({ success: true, message: "Recording queued for AI summary" });
  } catch (err: any) {
    console.error("Recording callback error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
