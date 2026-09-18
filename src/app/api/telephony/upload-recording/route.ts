import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeAudioRecordingWithGemini } from "@/lib/gemini";

// Health check endpoint (for testing in browser or MacroDroid test button)
export async function GET() {
  return NextResponse.json({
    status: "online",
    service: "Allota Pharma CRM - Telephony Recording Webhook",
    supportedMethods: ["POST"],
    description: "Accepts mobile call recordings via multipart/form-data or raw audio streams.",
    timestamp: new Date().toISOString(),
  });
}

function extractLast10Digits(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const contentType = req.headers.get("content-type") || "";

    // 1. Extract metadata from query parameters as base/fallback
    let customerPhone =
      url.searchParams.get("phone") ||
      url.searchParams.get("customerPhone") ||
      url.searchParams.get("clientPhone") ||
      "";
    let employeeIdentifier =
      url.searchParams.get("employee") ||
      url.searchParams.get("employeePhone") ||
      url.searchParams.get("employeeEmail") ||
      "";
    let rawDuration =
      url.searchParams.get("duration") ||
      url.searchParams.get("durationSec") ||
      "120";
    let direction =
      url.searchParams.get("direction") ||
      url.searchParams.get("callType") ||
      "OUTBOUND";

    let audioBuffer: Buffer | null = null;
    let mimeType = "audio/mp3";

    // 2. Parse payload based on Content-Type
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      // Check form fields
      if (!customerPhone && formData.has("customerPhone")) {
        customerPhone = String(formData.get("customerPhone"));
      }
      if (!customerPhone && formData.has("phone")) {
        customerPhone = String(formData.get("phone"));
      }
      if (!employeeIdentifier && formData.has("employeePhone")) {
        employeeIdentifier = String(formData.get("employeePhone"));
      }
      if (!employeeIdentifier && formData.has("employeeEmail")) {
        employeeIdentifier = String(formData.get("employeeEmail"));
      }
      if (formData.has("duration")) {
        rawDuration = String(formData.get("duration"));
      }
      if (formData.has("direction")) {
        direction = String(formData.get("direction"));
      }

      // Check file field
      const file =
        (formData.get("audio") as File | null) ||
        (formData.get("file") as File | null) ||
        (formData.get("recording") as File | null) ||
        (formData.get("media") as File | null);

      if (file && typeof file.arrayBuffer === "function") {
        const arrayBuf = await file.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
        mimeType = file.type || "audio/mp3";
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      customerPhone = customerPhone || body.customerPhone || body.phone || "";
      employeeIdentifier =
        employeeIdentifier ||
        body.employeePhone ||
        body.employeeEmail ||
        body.employee ||
        "";
      rawDuration = String(body.duration || rawDuration);
      direction = body.direction || direction;

      if (body.audioBase64) {
        audioBuffer = Buffer.from(body.audioBase64, "base64");
        mimeType = body.mimeType || "audio/mp3";
      }
    } else if (
      contentType.startsWith("audio/") ||
      contentType === "application/octet-stream"
    ) {
      // Direct raw binary stream from automation tool
      const arrayBuf = await req.arrayBuffer();
      if (arrayBuf.byteLength > 0) {
        audioBuffer = Buffer.from(arrayBuf);
        mimeType = contentType === "application/octet-stream" ? "audio/mp3" : contentType;
      }
    }

    const durationSec = parseInt(rawDuration, 10) || 0;
    const isMissed = durationSec === 0 || direction.toLowerCase().includes("missed");

    // 3. Match Employee in Database
    let employee = null;
    if (employeeIdentifier) {
      const cleanEmpDigits = extractLast10Digits(employeeIdentifier);
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { phoneNumber: { contains: cleanEmpDigits } },
            { user: { email: { equals: employeeIdentifier, mode: "insensitive" } } },
            { name: { contains: employeeIdentifier, mode: "insensitive" } },
          ],
        },
        include: { user: true },
      });
    }

    // 4. Match Lead or Client by Phone Number
    let lead = null;
    let client = null;
    if (customerPhone) {
      const last10 = extractLast10Digits(customerPhone);
      lead = await prisma.lead.findFirst({
        where: {
          phoneNumber: { contains: last10 },
        },
        include: { assignedEmployee: true },
      });

      if (!lead) {
        client = await prisma.client.findFirst({
          where: {
            phoneNumber: { contains: last10 },
          },
        });
      }
    }

    // If employee wasn't explicitly matched, inherit from Lead or take the first active employee
    if (!employee && lead?.assignedEmployee) {
      employee = lead.assignedEmployee;
    }

    if (!employee) {
      employee = await prisma.employee.findFirst({
        orderBy: { createdAt: "asc" },
      });
    }

    if (!employee) {
      return NextResponse.json(
        { error: "No employee found in the system to attribute call to." },
        { status: 400 }
      );
    }

    // 5. Analyze Audio using Gemini Flash (if audio recording provided and not a 0-sec missed call)
    let analysis = null;
    if (audioBuffer && audioBuffer.length > 0 && !isMissed) {
      try {
        const audioBase64 = audioBuffer.toString("base64");
        const customerName = lead?.name || client?.name || `Customer (${customerPhone})`;
        analysis = await analyzeAudioRecordingWithGemini({
          audioBase64,
          mimeType,
          employeeName: employee.name,
          customerName,
        });
      } catch (aiErr) {
        console.error("Gemini call analysis failed:", aiErr);
        // We still save the call record even if AI processing encountered an error
      }
    }

    // 6. Save Call Record in Prisma
    const callRecord = await prisma.call.create({
      data: {
        employeeId: employee.id,
        leadId: lead?.id || null,
        clientId: client?.id || null,
        direction: direction.toUpperCase().includes("IN") ? "INBOUND" : "OUTBOUND",
        missed: isMissed,
        recordingUrl: null,
        transcript: analysis?.transcript || (isMissed ? "Call not answered." : "Recording saved."),
        aiSummary:
          analysis?.aiSummary ||
          (isMissed
            ? `Customer did not pick up the call (${durationSec}s). WhatsApp recovery alert queued.`
            : `Call completed with ${customerPhone || "customer"} (${durationSec}s).`),
        behaviorTags:
          analysis?.behaviorTags ||
          (isMissed ? ["Missed Call", "Follow-up Needed"] : ["Android Recording", "Connected"]),
        whatsappSent: false,
        durationSec: durationSec > 0 ? durationSec : 0,
        occurredAt: new Date(),
      },
      include: {
        employee: true,
        lead: true,
        client: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Call recording received and processed successfully.",
      call: {
        id: callRecord.id,
        employeeName: employee.name,
        customerName: lead?.name || client?.name || customerPhone,
        customerPhone,
        durationSec: callRecord.durationSec,
        missed: callRecord.missed,
        sentiment: analysis?.sentiment || (isMissed ? "MISSED" : "NEUTRAL"),
        aiSummary: callRecord.aiSummary,
        behaviorTags: callRecord.behaviorTags,
      },
    });
  } catch (error: any) {
    console.error("Error in upload-recording API:", error);
    return NextResponse.json(
      { error: "Internal server error processing call recording", details: error?.message },
      { status: 500 }
    );
  }
}
