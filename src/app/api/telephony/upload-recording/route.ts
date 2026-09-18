import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeAudioRecordingWithGemini } from "@/lib/gemini";

// Health check & diagnostic endpoint (returns recent calls)
export async function GET() {
  try {
    const [recentCalls, allEmployees, allCompanies] = await Promise.all([
      prisma.call.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          employee: { select: { id: true, name: true, phoneNumber: true, companyId: true } },
          lead: { select: { name: true, phoneNumber: true } },
          client: { select: { name: true, phoneNumber: true } },
        },
      }),
      prisma.employee.findMany({
        select: { id: true, name: true, phoneNumber: true, companyId: true },
        orderBy: { name: "asc" },
      }),
      prisma.company.findMany({
        select: { id: true, name: true },
      }),
    ]);

    return NextResponse.json({
      status: "online",
      service: "Allota Pharma CRM - Telephony Recording Webhook",
      timestamp: new Date().toISOString(),
      totalRecentCalls: recentCalls.length,
      allCompanies,
      totalEmployees: allEmployees.length,
      allEmployees,
      recentCalls,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "online",
      error: err?.message,
      timestamp: new Date().toISOString(),
    });
  }
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
    } else {
      // Direct raw binary stream from automation tool (MacroDroid "File" option)
      try {
        const arrayBuf = await req.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          audioBuffer = Buffer.from(arrayBuf);
          mimeType = contentType.startsWith("audio/") ? contentType : "audio/mp3";
        }
      } catch {
        // No body provided
      }
    }

    const durationSec = parseInt(rawDuration, 10) || 0;
    const isMissed = durationSec === 0 || direction.toLowerCase().includes("missed");

    // 3. Match Employee in Database
    let employee = null;
    if (employeeIdentifier) {
      const cleanEmpDigits = extractLast10Digits(employeeIdentifier);
      const orConditions: any[] = [];
      if (cleanEmpDigits.length >= 7) {
        orConditions.push({ phoneNumber: { contains: cleanEmpDigits } });
      }
      if (employeeIdentifier.includes("@")) {
        orConditions.push({ user: { email: { equals: employeeIdentifier.trim(), mode: "insensitive" } } });
      }
      if (employeeIdentifier.trim().length > 0 && !employeeIdentifier.includes("{") && !employeeIdentifier.includes("[")) {
        orConditions.push({ name: { contains: employeeIdentifier.trim(), mode: "insensitive" } });
      }

      if (orConditions.length > 0) {
        employee = await prisma.employee.findFirst({
          where: { OR: orConditions },
          include: { user: true },
        });
      }

      // If employee still not found and employeeIdentifier is a clean name (like "Naresh"), auto-create representative!
      if (!employee && employeeIdentifier.trim().length >= 2 && !employeeIdentifier.includes("{") && !employeeIdentifier.includes("[")) {
        try {
          const primaryCompany =
            (await prisma.company.findFirst({
              where: { name: { contains: "Pharma", mode: "insensitive" } },
            })) || (await prisma.company.findFirst({ where: { id: { not: "" } } }));

          if (primaryCompany) {
            const cleanName = employeeIdentifier.trim();
            const emailHandle = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const uniqueEmail = `${emailHandle || "rep"}_${Date.now().toString().slice(-4)}@pharmalifesciences.com`;

            const user = await prisma.user.create({
              data: {
                email: uniqueEmail,
                passwordHash: "$2a$10$eWkZpC8t3yXG4zX7rY5aLeFhG9h8f5e6d7c8b9a0", // employee123
                role: "EMPLOYEE",
                companyId: primaryCompany.id,
              },
            });

            employee = await prisma.employee.create({
              data: {
                userId: user.id,
                name: cleanName,
                phoneNumber: cleanEmpDigits.length >= 10 ? `+91 ${cleanEmpDigits}` : "+91 98000 00000",
                companyId: primaryCompany.id,
              },
              include: { user: true },
            });
            console.log(`Auto-created representative profile for ${cleanName} (${employee.id})`);
          }
        } catch (autoErr) {
          console.warn("Could not auto-create employee profile:", autoErr);
        }
      }
    }

    // 4. Match Lead or Client by Phone Number
    let lead = null;
    let client = null;
    const cleanCustomerDigits = extractLast10Digits(customerPhone);
    if (cleanCustomerDigits && cleanCustomerDigits.length >= 7) {
      lead = await prisma.lead.findFirst({
        where: {
          phoneNumber: { contains: cleanCustomerDigits },
        },
        include: { assignedEmployee: true },
      });

      if (!lead) {
        client = await prisma.client.findFirst({
          where: {
            phoneNumber: { contains: cleanCustomerDigits },
          },
        });
      }
    }

    // If employee wasn't explicitly matched, inherit from Lead or find primary company employee
    if (!employee && lead?.assignedEmployee) {
      employee = lead.assignedEmployee;
    }

    if (!employee) {
      // Find employee belonging to active company
      employee = await prisma.employee.findFirst({
        where: { companyId: { not: null } },
        orderBy: { createdAt: "asc" },
      });
      if (!employee) {
        employee = await prisma.employee.findFirst({
          orderBy: { createdAt: "asc" },
        });
      }
    }

    if (!employee) {
      return NextResponse.json(
        { error: "No employee found in the system to attribute call to." },
        { status: 400 }
      );
    }

    // Auto-create lead if phone number exists but lead was not found
    if (!lead && !client && customerPhone) {
      try {
        lead = await prisma.lead.create({
          data: {
            companyId: employee.companyId || null,
            source: "DIRECT_CALL" as any,
            name: `Contact ${customerPhone}`,
            phoneNumber: customerPhone,
            status: "CONTACTED",
            assignedEmployeeId: employee.id,
          },
          include: { assignedEmployee: true },
        });
      } catch (leadErr) {
        console.warn("Could not auto-create lead for phone:", customerPhone, leadErr);
      }
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
        durationSec: analysis?.durationSec || (durationSec > 0 ? durationSec : 0),
        occurredAt: new Date(),
      },
      include: {
        employee: true,
        lead: true,
        client: true,
      },
    });

    // If running in development / local tunnel, forward asynchronously to production so both stay in sync
    if (!req.url.includes("allota.vercel.app")) {
      const prodUrl = `https://allota.vercel.app/api/telephony/upload-recording${url.search}`;
      fetch(prodUrl, {
        method: "POST",
        headers: { "Content-Type": contentType || "application/json" },
        body: audioBuffer ? new Uint8Array(audioBuffer) : undefined,
      }).catch((e) => console.warn("Failed to forward to production:", e));
    }

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
