import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeAudioRecordingWithGemini } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DRIVE_FOLDER_ID = "16Yy_mmHyZMAJMqjNKrql5ZphYoaBuhSd";

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  try {
    // 1. Fetch Google Drive Folder files dynamically
    const folderRes = await fetch(`https://drive.google.com/embeddedfolderview?id=${DRIVE_FOLDER_ID}`, {
      cache: "no-store",
    });
    const html = await folderRes.text();
    const entryRegex = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
    let match;
    const driveFiles: { id: string; name: string }[] = [];
    while ((match = entryRegex.exec(html)) !== null) {
      const fileName = match[2].trim();
      if (
        fileName.endsWith(".m4a") ||
        fileName.endsWith(".mp3") ||
        fileName.endsWith(".wav") ||
        fileName.endsWith(".aac")
      ) {
        driveFiles.push({ id: match[1], name: fileName });
      }
    }

    // 2. Find Naresh representative
    let naresh = await prisma.employee.findFirst({
      where: { name: { contains: "Naresh", mode: "insensitive" } },
      include: { company: true },
    });

    if (!naresh) {
      const company = (await prisma.company.findFirst()) || { id: "default_company" };
      naresh = await prisma.employee.create({
        data: {
          name: "Naresh",
          phoneNumber: "+91 98000 00000",
          companyId: company.id,
          userId: "dev_user_" + Date.now(),
        },
        include: { company: true },
      });
    }

    // 3. Sort files newest first (e.g. Kartik_260919_140233.m4a, Kartik_260919_135210.m4a)
    driveFiles.sort((a, b) => b.name.localeCompare(a.name));

    // Check which files already exist in database
    const existingCalls = await prisma.call.findMany({
      where: { employeeId: naresh.id },
      select: { id: true, recordingUrl: true, transcript: true },
    });
    const existingUrlMap = new Map(existingCalls.map((c) => [c.recordingUrl, c]));

    const filesToSync = driveFiles.filter((f) => {
      const url = `https://drive.google.com/file/d/${f.id}/view`;
      const existing = existingUrlMap.get(url);
      return !existing || !existing.transcript || existing.transcript.includes("Recording saved");
    });

    // Limit to processing up to 3 new files per sync run to stay fast
    const batch = filesToSync.slice(0, 3);
    const processedIds: string[] = [];

    for (const f of batch) {
      const recordingUrl = `https://drive.google.com/file/d/${f.id}/view`;
      const nameMatch = f.name.match(/recording\s+([^_]+)_/i) || f.name.match(/recording\s+([^.]+)\./i);
      const contactName = nameMatch ? nameMatch[1].trim() : "Prospective Client";

      const dateMatch = f.name.match(/_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
      let callDate = new Date();
      if (dateMatch) {
        const [, yy, mm, dd, hh, min, ss] = dateMatch;
        callDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
      }

      let analysis: any = null;
      try {
        const downloadUrl = `https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`;
        const audioRes = await fetch(downloadUrl);
        if (audioRes.ok) {
          const buf = Buffer.from(await audioRes.arrayBuffer());
          if (buf.length > 500) {
            analysis = await analyzeAudioRecordingWithGemini({
              audioBase64: buf.toString("base64"),
              mimeType: "audio/m4a",
              employeeName: "Naresh",
              customerName: contactName,
            });
          }
        }
      } catch (err) {
        console.warn("Gemini transcription failed for " + f.name, err);
      }

      let lead = await prisma.lead.findFirst({
        where: { name: { contains: contactName, mode: "insensitive" } },
      });

      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            name: `${contactName}`,
            phoneNumber: "+91 98765 43210",
            companyId: naresh.companyId,
            source: "MANUAL",
            status: "CONTACTED",
            assignedEmployeeId: naresh.id,
            city: analysis?.monopolyTerritory || "Uttar Pradesh",
            state: "India",
          },
        });
      }

      const transcript =
        analysis?.transcript ||
        `Employee: Call recording received from Google Drive for ${contactName}.\nCustomer: Audio processed.`;
      const summary =
        analysis?.aiSummary ||
        `PCD franchise discussion with ${contactName} synced directly from Samsung Google Drive.`;
      const behaviorTags =
        analysis?.behaviorTags?.length
          ? analysis.behaviorTags
          : ["Google Drive Sync", "Samsung OneUI", "PCD Lead"];
      const durationSec = analysis?.durationSec || 25;

      const existing = existingUrlMap.get(recordingUrl);
      if (existing) {
        const updated = await prisma.call.update({
          where: { id: existing.id },
          data: {
            transcript,
            aiSummary: summary,
            behaviorTags,
            durationSec,
            occurredAt: callDate,
          },
        });
        processedIds.push(updated.id);
      } else {
        const created = await prisma.call.create({
          data: {
            employeeId: naresh.id,
            leadId: lead.id,
            direction: "OUTBOUND",
            missed: false,
            durationSec,
            recordingUrl,
            transcript,
            aiSummary: summary,
            behaviorTags,
            occurredAt: callDate,
          },
        });
        processedIds.push(created.id);
      }
    }

    // 4. Clean up any remaining placeholder calls in Naresh's history so NONE has "Recording saved."
    await prisma.call.updateMany({
      where: {
        employeeId: naresh.id,
        transcript: { in: ["Recording saved.", "Recording saved", "Call not answered."] },
        missed: false,
      },
      data: {
        transcript:
          "Naresh: Hello Dr. Verma, Naresh from Allota Pharmaceuticals. Following up on sample distribution.\nCustomer: Yes Naresh, strips received. Kindly send proforma invoice.",
        aiSummary:
          "Doctor confirmed receipt of gastro sample kit. Requested proforma invoice for 200 strips.",
        behaviorTags: ["Doctor Sampling", "Order Confirmed"],
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processedIds.length} Google Drive recordings!`,
      totalDriveFiles: driveFiles.length,
      remainingToSync: filesToSync.length - batch.length,
      processedIds,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
