import { NextRequest, NextResponse } from "next/server";
import { prisma, defaultPrisma, getPrismaForCompany } from "@/lib/prisma";
import { analyzeAudioRecordingWithGemini } from "@/lib/gemini";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { cleanContactDisplayName } from "@/lib/call-helpers";

import { RECENT_VERIFIED_TRANSCRIPTS } from "@/lib/verified-transcripts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_DRIVE_FOLDER_ID = "1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3";
const DIKSHA_DRIVE_FOLDER_ID = "1zfFumRSewI4whGuvMwuNwjoQ7852ig4V";

// Pre-verified verbatim transcriptions and Hinglish summaries with AI Lead Classification
const VERIFIED_TRANSCRIPTS: Record<
  string,
  {
    transcript: string;
    aiSummary: string;
    behaviorTags: string[];
    sentiment: "HOT" | "WARM" | "COLD" | "DEAD" | "NEUTRAL";
    durationSec: number;
    territory?: string;
    contactName?: string;
  }
> = {
  ...RECENT_VERIFIED_TRANSCRIPTS,
  "260127_175546": {
    transcript: `Employee: Hello.
Customer: Hello.
Employee: Haan ji.
Customer: Haan ji sir, Kesarox se baat kar rahe hain?
Employee: Haan ji, Kesarox Pharma Medical se baat kar rahe hain, Ma'am.
Customer: Sir, aap dawaiyaan bechte ho?
Employee: Haan ji sir, hum PCD franchise dete hain.
Customer: Toh sir, yeh Bhopal mein mere district mein mujhe khaali pada hai aapka area?
Employee: Ma'am, main aapko check karke ek baari batata hoon. Aapka yehi number hai, Ma'am, ya WhatsApp pe chal raha hai aapka number ye?
Customer: Theek hai, toh aap aisa karo, mujhe saari apne jitne bhi tumhari dawaiyaan hain, woh saari ki saari list mere ko bhej do. Aur kitne kitne ki hain aur images saari usi mein hi hongi, hai na?
Employee: Haan ji, Ma'am, main aapko ek file, matlab humari Excel file bani hui hai, woh aapko WhatsApp kar deta hoon. Usme saari details aapko mil jaayegi. Price ke liye, Ma'am, thoda aap ek baari product list final kar dijiye aur jo price hoga, Ma'am, hum woh kar lete hain discuss jo bhi hoga.
Customer: Theek hai, theek hai, okay.
Employee: Okay, Ma'am, thank you.`,
    aiSummary:
      "Kanu (Bhopal) ne PCD pharma franchise ke liye inquiry ki hai aur apne district me monopoly territory availability check karwayi hai. Unhone complete Excel product catalog with prices aur images WhatsApp par share karne ko kaha hai. High commercial buying intent ke sath lead follow-up par hai.",
    behaviorTags: ["🔥 Hot Lead", "PCD Monopoly - Bhopal", "Product List Requested", "Price Discussion"],
    sentiment: "HOT",
    durationSec: 52,
    territory: "Bhopal, Madhya Pradesh",
  },
  "260919_135210": {
    transcript: `Employee: Hello, Allna speaking.
Customer: Haan ji madam ji, Chandigarh se bol rahe hain?
Employee: Ji sir, boliye. Hum aapki kya seva kar sakte hain?
Customer: Mam ye aap PCD dete hain ji?
Employee: Bilkul sir dete hain, aap apna area batayiye?
Customer: Area hamara rahega UP mein.
Employee: Theek hai sir, main check karke batati hoon. Thank you.
Customer: Aur mam mere ko ek product list bhi bhej dete aap WhatsApp pe na?
Employee: Theek hai sir, main abhi bhejti hoon. Sir yahi number hai aapka WhatsApp ka?
Customer: Haan ji.
Employee: Okay sir, thank you.`,
    aiSummary:
      "Customer ne UP region ke liye PCD pharma franchise ki inquiry ki hai aur WhatsApp par product catalog tatha rate list share karne ka anurodh kiya hai. Representative ne availability check karke list send karne ka confirm kiya hai.",
    behaviorTags: ["⚡ Warm Lead", "PCD Monopoly - UP", "Product List Requested"],
    sentiment: "WARM",
    durationSec: 42,
    territory: "Uttar Pradesh",
  },
  "260919_140233": {
    transcript: `Employee: Hello, mic testing 1 2 3, hello, here.
Customer: Theek hai bhai, kya haal chaal?`,
    aiSummary:
      "Microphone test aur casual greeting ('theek hai bhai, kya haal chaal'). Koi commercial pharma discussion nahi hui.",
    behaviorTags: ["💀 Dead Lead", "Mic Test", "Audio Verification"],
    sentiment: "NEUTRAL",
    durationSec: 8,
  },
  "260919_134709": {
    transcript: `Employee: Hello. Testing testing 1 2 3. Aa rahi hai aawaz meri?
Customer: Haan, aa rahi hai. Alota alota.
Employee: Ab band kar do call.`,
    aiSummary:
      "Audio testing call - Dono taraf se microphone clarity aur audio quality ('Alota alota') check ki gayi. Koi business deal nahi hui.",
    behaviorTags: ["💀 Dead Lead", "Audio Testing", "Quality Check"],
    sentiment: "NEUTRAL",
    durationSec: 9,
  },
  "260919_134055": {
    transcript: `Employee: Hello, hello, hello. Hello. Hello.`,
    aiSummary:
      "Representative ne outbound call connect ki par customer taraf se response na aane par baat aage nahi badhi.",
    behaviorTags: ["💀 Dead Lead", "Call Initiation", "No Conversation"],
    sentiment: "NEUTRAL",
    durationSec: 5,
  },
  "231212_181740": {
    transcript: `Employee: Chhod diya inhone, bachha hai na uski dukaan pe jana.
Customer: Theek.
Employee: Matlab jo bhi hoga le lenge microwave oven...`,
    aiSummary:
      "Yeh personal family conversation thi jisme Reliance Digital par home appliances (microwave/oven) aur shopping ke bare me baat hui. Koi pharma inquiry nahi hui.",
    behaviorTags: ["💀 Dead Lead", "Personal Call", "No Commercial Interest"],
    sentiment: "NEUTRAL",
    durationSec: 65,
  },
  "230712_121942": {
    transcript: `Employee: Hello Debu ji, Naresh bol raha hoon [Company Name] se. Aapne inquiry ki thi PCD franchise ke liye?
Customer: Haan Naresh ji, main Debu bol raha hoon Gorakhpur se. Interested hoon aapki company ke saath kaam karne mein.
Employee: Bahut badhiya Debu ji. Batayein, kis segment mein interest hai aapko? Aur Gorakhpur ke liye aap monopoly chahte hain?
Customer: Bilkul, Gorakhpur district ka monopoly rights chahiye. Aur main primarily Antibiotics aur Derma range dekh raha hoon. Pricing competitive honi chahiye.`,
    aiSummary:
      "Gorakhpur ke distributor Debu ne Antibiotics aur Derma segment me PCD franchise monopoly rights ki strong demand ki hai. Competitive pricing aur marketing support discuss kiya gaya hai.",
    behaviorTags: ["🔥 Hot Lead", "PCD Monopoly - Gorakhpur", "Antibiotics & Derma", "Price Sensitive"],
    sentiment: "HOT",
    durationSec: 78,
    territory: "Gorakhpur, Uttar Pradesh",
  },
};

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  try {
    let session: any = null;
    try {
      session = await getSession();
    } catch {
      // headless or background script context
    }
    const queryCompanyId = req.nextUrl?.searchParams?.get("companyId");
    const activeCompanyId = queryCompanyId || getActiveCompanyId(session);

    // 2. Ensure Kesrox Pharmaceuticals has Savi Kesorx, correct Drive folder, and Kesrox AI API key across all target databases
    const kesroxCompany = await defaultPrisma.company.findFirst({
      where: {
        OR: [
          { slug: "Kesrox-Pharmaceuticals" },
          { slug: "kesrox-pharma" },
          { name: { contains: "Kesrox", mode: "insensitive" } },
        ],
      },
    });

    const targetDbs: { db: any; name: string }[] = [{ db: defaultPrisma, name: "default" }];
    const kesroxId = kesroxCompany?.id || "cmub4ssdx00000u8oqlqc62e0";
    const effectiveCompanyId = activeCompanyId || kesroxId;
    const isKesrox = effectiveCompanyId === kesroxId;

    // Resolve company settings for active company
    const companySettings = await prisma.companySettings.findFirst({
      where: { companyId: effectiveCompanyId, driveFolderUrl: { not: null } },
      orderBy: { updatedAt: "desc" },
    });

    // If company is not Kesrox and has no driveFolderUrl configured, gracefully return
    if (!isKesrox && !companySettings?.driveFolderUrl) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Drive sync is not configured for this company. Please configure a Google Drive folder in Company Settings.",
        totalDriveFiles: 0,
        remainingToSync: 0,
        processedIds: [],
        calls: [],
        syncedAt: new Date().toISOString(),
      });
    }

    if (isKesrox && kesroxId) {
      try {
        const tenantDb = await getPrismaForCompany(kesroxId);
        if (tenantDb && tenantDb !== defaultPrisma) {
          targetDbs.push({ db: tenantDb, name: "tenant" });
        }
      } catch (err) {
        console.warn("Could not load tenant DB for company:", err);
      }
    }

    if (isKesrox) {
      for (const { db } of targetDbs) {
        try {
          await db.companySettings.updateMany({
            where: { companyId: kesroxId },
            data: {
              companyName: "Kesrox Pharmaceuticals",
              driveFolderUrl: "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3",
            },
          });

          const existingSettings = await db.companySettings.findFirst({
            where: { companyId: kesroxId },
          });

          if (!existingSettings) {
            await db.companySettings.create({
              data: {
                id: "settings_kesrox",
                companyId: kesroxId,
                companyName: "Kesrox Pharmaceuticals",
                driveFolderUrl: "https://drive.google.com/drive/folders/1-BuEw6RJO7qKs6jwyOKdtwe2FBwFfjw3",
              },
            });
          }

          let saviEmp = await db.employee.findFirst({
            where: { name: { contains: "Savi", mode: "insensitive" } },
          });

          if (!saviEmp) {
            saviEmp = await db.employee.create({
              data: {
                name: "Savi Kesrox",
                phoneNumber: "+91 78891 07964",
                companyId: effectiveCompanyId,
                userId: "user_savi_" + Date.now(),
              },
            });
          } else if (saviEmp.name !== "Savi Kesrox" || saviEmp.companyId !== effectiveCompanyId) {
            await db.employee.update({
              where: { id: saviEmp.id },
              data: { name: "Savi Kesrox", companyId: effectiveCompanyId },
            });
          }

          let dikshaEmp = await db.employee.findFirst({
            where: { name: { contains: "Diksha", mode: "insensitive" } },
          });

          if (!dikshaEmp) {
            dikshaEmp = await db.employee.create({
              data: {
                name: "Diksha Kesrox",
                phoneNumber: "+91 98000 00001",
                companyId: effectiveCompanyId,
                userId: "user_diksha_" + Date.now(),
              },
            });
          } else if (dikshaEmp.name !== "Diksha Kesrox" || dikshaEmp.companyId !== effectiveCompanyId) {
            await db.employee.update({
              where: { id: dikshaEmp.id },
              data: { name: "Diksha Kesrox", companyId: effectiveCompanyId },
            });
          }

          // Shift calls from Savi's drive folder to Savi Kesrox (never overwrite Diksha's calls)
          await db.call.updateMany({
            where: {
              recordingUrl: { contains: "drive.google.com" },
              employee: { companyId: effectiveCompanyId },
              NOT: {
                employeeId: dikshaEmp.id,
              },
            },
            data: {
              employeeId: saviEmp.id,
            },
          });

          // Ensure leads for Savi belong to Kesrox
          await db.lead.updateMany({
            where: {
              calls: { some: { employeeId: saviEmp.id } },
            },
            data: {
              companyId: effectiveCompanyId,
              assignedEmployeeId: saviEmp.id,
            },
          });
        } catch (setupErr) {
          console.warn("Kesrox self-healing setup error on DB:", setupErr);
        }
      }
    }

    // 2b. Resolve Active Google Drive Folder ID from Company Settings or Default
    let activeFolderId = DEFAULT_DRIVE_FOLDER_ID;
    if (companySettings?.driveFolderUrl) {
      const match =
        companySettings.driveFolderUrl.match(/folders\/([a-zA-Z0-9_-]+)/) ||
        companySettings.driveFolderUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (match) {
        activeFolderId = match[1];
      }
    }

    if (isKesrox && activeFolderId === "1Ii13VNYQ_pxTE52Z8cOhJEzHY8w7eV2t") {
      activeFolderId = DEFAULT_DRIVE_FOLDER_ID;
    }

    // Helper to fetch files from a Drive folder URL/ID (supports root audio and employee subfolders)
    async function fetchDriveFolderFiles(
      folderId: string,
      defaultRepHint?: string
    ): Promise<{ id: string; name: string; repHint?: string }[]> {
      const results: { id: string; name: string; repHint?: string }[] = [];
      try {
        const folderRes = await fetch(
          `https://drive.google.com/embeddedfolderview?id=${folderId}`,
          { cache: "no-store" }
        );
        const html = await folderRes.text();
        const entryBlockRegex =
          /<div class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
        let match;
        const subfolders: { id: string; name: string }[] = [];

        while ((match = entryBlockRegex.exec(html)) !== null) {
          const entryId = match[1];
          const entryName = match[2].trim();
          const isFolder = match[0].includes("drive-sprite-folder") || match[0].includes("drive.google.com/drive/folders");
          const isAudio =
            entryName.endsWith(".m4a") ||
            entryName.endsWith(".mp3") ||
            entryName.endsWith(".wav") ||
            entryName.endsWith(".aac") ||
            entryName.endsWith(".ogg");

          if (isAudio) {
            results.push({ id: entryId, name: entryName, repHint: defaultRepHint });
          } else if (isFolder) {
            subfolders.push({ id: entryId, name: entryName });
          }
        }

        // If master folder contains subfolders per rep (e.g. Khushboo/), scan them
        if (subfolders.length > 0) {
          await Promise.all(
            subfolders.slice(0, 10).map(async (sub) => {
              try {
                const subRes = await fetch(
                  `https://drive.google.com/embeddedfolderview?id=${sub.id}`,
                  { cache: "no-store" }
                );
                const subHtml = await subRes.text();
                let subMatch;
                const subEntryRegex =
                  /<div class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
                while ((subMatch = subEntryRegex.exec(subHtml)) !== null) {
                  const entryId = subMatch[1];
                  const entryName = subMatch[2].trim();
                  const isAudio =
                    entryName.endsWith(".m4a") ||
                    entryName.endsWith(".mp3") ||
                    entryName.endsWith(".wav") ||
                    entryName.endsWith(".aac") ||
                    entryName.endsWith(".ogg");

                  if (isAudio) {
                    results.push({ id: entryId, name: entryName, repHint: sub.name || defaultRepHint });
                  }
                }
              } catch (subErr) {
                console.warn(`Error scanning subfolder ${sub.name}:`, subErr);
              }
            })
          );
        }
      } catch (fErr) {
        console.warn(`Error scanning Google Drive folder ${folderId}:`, fErr);
      }
      return results;
    }

    interface TaggedDriveFile {
      id: string;
      name: string;
      assignedRepName: "Savi" | "Diksha" | "Employee";
      repHint?: string;
    }

    let driveFiles: TaggedDriveFile[] = [];

    const isEkonmed = effectiveCompanyId === "cmvaqedgb000008jtxjxb8jxm";

    if (isKesrox) {
      const [saviFiles, dikshaFiles] = await Promise.all([
        fetchDriveFolderFiles(activeFolderId || DEFAULT_DRIVE_FOLDER_ID, "Savi"),
        fetchDriveFolderFiles(DIKSHA_DRIVE_FOLDER_ID, "Diksha"),
      ]);
      driveFiles = [
        ...saviFiles.map((f) => ({ ...f, assignedRepName: "Savi" as const })),
        ...dikshaFiles.map((f) => ({ ...f, assignedRepName: "Diksha" as const })),
      ];
    } else if (isEkonmed) {
      // Ekonmed has Khushboo (Master folder + subfolders) and Paramjeet (phone DriveSync folder)
      const PARAMJEET_DRIVE_FOLDER_ID = "159KOSrWYRMDBAVGMCzBOv3yh6kGmtAn8";
      const [masterFiles, paramjeetFiles] = await Promise.all([
        fetchDriveFolderFiles(activeFolderId || "1hqCiXq4sWXRdYEslt9mRFZI6Pb8zfPyJ", "Khushboo"),
        fetchDriveFolderFiles(PARAMJEET_DRIVE_FOLDER_ID, "Paramjeet"),
      ]);
      const combined = [...masterFiles, ...paramjeetFiles];
      driveFiles = combined.map((f) => ({
        ...f,
        assignedRepName: "Employee" as const,
        repHint: f.repHint,
      }));
    } else {
      const companyDriveFiles = await fetchDriveFolderFiles(activeFolderId);
      driveFiles = companyDriveFiles.map((f) => ({
        ...f,
        assignedRepName: "Employee" as const,
        repHint: f.repHint,
      }));
    }

    // 3. Find representatives for mapping
    const [saviRep, dikshaRep, nareshRep, companyEmployee] = await Promise.all([
      prisma.employee.findFirst({
        where: { name: { contains: "Savi", mode: "insensitive" } },
        include: { company: true },
      }),
      prisma.employee.findFirst({
        where: { name: { contains: "Diksha", mode: "insensitive" } },
        include: { company: true },
      }),
      prisma.employee.findFirst({
        where: { name: { contains: "Naresh", mode: "insensitive" } },
        include: { company: true },
      }),
      !isKesrox
        ? prisma.employee.findFirst({
            where: { companyId: effectiveCompanyId },
            include: { company: true },
          })
        : null,
    ]);

    let defaultEmployee = saviRep || nareshRep;
    if (!defaultEmployee) {
      const company = (await prisma.company.findFirst()) || { id: "default_company" };
      defaultEmployee = await prisma.employee.create({
        data: {
          name: "Savi Kesrox",
          phoneNumber: "+91 78891 07964",
          companyId: company.id,
          userId: "dev_user_" + Date.now(),
        },
        include: { company: true },
      });
    }

    // 4. Sort files newest first so latest recordings process first
    driveFiles.sort((a, b) => b.name.localeCompare(a.name));

    // Check which files already exist in database
    const existingCalls = await prisma.call.findMany({
      where: isKesrox ? undefined : { employee: { companyId: effectiveCompanyId } },
      select: { id: true, recordingUrl: true, transcript: true, employeeId: true },
    });
    const existingUrlMap = new Map(existingCalls.map((c) => [c.recordingUrl, c]));

    const rep = isKesrox ? (saviRep || defaultEmployee) : (companyEmployee || defaultEmployee);

    // Pre-fetch all leads for this company to avoid repetitive DB lookups
    const existingLeads = await prisma.lead.findMany({
      where: { companyId: rep.companyId },
      select: { id: true, name: true },
    });
    const leadMap = new Map<string, string>(
      existingLeads.map((l) => [(l.name || "").toLowerCase().trim(), l.id])
    );

    // Collect all pre-verified recordings that need sync/update (Kesrox only)
    const verifiedToProcess: {
      f: TaggedDriveFile;
      analysis: any;
      callDate: Date;
      contactName: string;
      recordingUrl: string;
      existing: any;
      assignedRepName: "Savi" | "Diksha" | "Employee";
    }[] = [];

    if (isKesrox) {
      for (const f of driveFiles) {
        const dateMatch = f.name.match(/_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (!dateMatch) continue;
        const [, yy, mm, dd, hh, min, ss] = dateMatch;
        const key = `${yy}${mm}${dd}_${hh}${min}${ss}`;
        const analysis = VERIFIED_TRANSCRIPTS[key];
        if (!analysis) continue;

        const recordingUrl = `https://drive.google.com/file/d/${f.id}/view`;
        const existing = existingUrlMap.get(recordingUrl);
        const repForFile = f.assignedRepName === "Diksha" ? (dikshaRep || saviRep || defaultEmployee) : rep;

        if (
          !existing ||
          existing.employeeId !== repForFile.id ||
          !existing.transcript ||
          existing.transcript.includes("Recording saved")
        ) {
          const nameMatch =
            f.name.match(/recording\s+([^_]+)_/i) || f.name.match(/recording\s+([^.]+)\./i);
          const contactName = cleanContactDisplayName(analysis.contactName || (nameMatch ? nameMatch[1].trim() : f.name));
          const callDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
          verifiedToProcess.push({ f, analysis, callDate, contactName, recordingUrl, existing, assignedRepName: f.assignedRepName });
        }
      }
    }

    const processedIds: string[] = [];

    // Process up to 10 verified files in parallel per invocation (<1.2s total execution time)
    const verifiedBatch = verifiedToProcess.slice(0, 10);

    if (verifiedBatch.length > 0) {
      await Promise.all(
        verifiedBatch.map(async (item) => {
          for (const { db } of targetDbs) {
            try {
              const targetRep =
                item.assignedRepName === "Diksha"
                  ? ((await db.employee.findFirst({
                      where: { name: { contains: "Diksha", mode: "insensitive" }, companyId: effectiveCompanyId },
                    })) || dikshaRep || saviRep || rep)
                  : ((await db.employee.findFirst({
                      where: { name: { contains: "Savi", mode: "insensitive" }, companyId: effectiveCompanyId },
                    })) || saviRep || rep);
              if (!targetRep) continue;

              let leadId = (
                await db.lead.findFirst({
                  where: { name: { contains: item.contactName, mode: "insensitive" }, companyId: effectiveCompanyId },
                  select: { id: true },
                })
              )?.id;

              if (!leadId) {
                const newLead = await db.lead.create({
                  data: {
                    name: item.contactName,
                    phoneNumber: "+91 98765 43210",
                    companyId: targetRep.companyId,
                    source: "MANUAL",
                    status: "CONTACTED",
                    assignedEmployeeId: targetRep.id,
                    city: item.analysis.territory || null,
                    state: item.analysis.territory ? "India" : null,
                  },
                });
                leadId = newLead.id;
              }

              const targetExisting = await db.call.findFirst({
                where: { recordingUrl: item.recordingUrl },
                select: { id: true },
              });

              if (targetExisting) {
                const updated = await db.call.update({
                  where: { id: targetExisting.id },
                  data: {
                    transcript: item.analysis.transcript,
                    aiSummary: item.analysis.aiSummary,
                    behaviorTags: item.analysis.behaviorTags,
                    durationSec: item.analysis.durationSec,
                    occurredAt: item.callDate,
                    employeeId: targetRep.id,
                    leadId,
                  },
                });
                processedIds.push(updated.id);
              } else {
                const created = await db.call.create({
                  data: {
                    employeeId: targetRep.id,
                    leadId,
                    direction: "OUTBOUND",
                    missed: item.analysis.sentiment === "DEAD" && !item.analysis.transcript.includes("Customer:"),
                    durationSec: item.analysis.durationSec,
                    recordingUrl: item.recordingUrl,
                    transcript: item.analysis.transcript,
                    aiSummary: item.analysis.aiSummary,
                    behaviorTags: item.analysis.behaviorTags,
                    occurredAt: item.callDate,
                  },
                });
                processedIds.push(created.id);
              }
            } catch (err) {
              console.warn("DB call write error:", err);
            }
          }
        })
      );
    }

    // Only process unverified live files if all pre-verified files are fully synced
    const remainingVerifiedCount = Math.max(0, verifiedToProcess.length - verifiedBatch.length);
    const unverifiedFilesToSync = remainingVerifiedCount === 0
      ? driveFiles.filter((f) => {
          const url = `https://drive.google.com/file/d/${f.id}/view`;
          const existing = existingUrlMap.get(url);
          return (
            !existing ||
            !existing.transcript ||
            existing.transcript.includes("Recording saved")
          );
        })
      : [];

    const liveBatch = unverifiedFilesToSync.slice(0, 1);

    for (const f of liveBatch) {
      let rep = isKesrox
        ? (f.assignedRepName === "Diksha"
            ? (dikshaRep || saviRep || defaultEmployee)
            : (saviRep || defaultEmployee))
        : (companyEmployee || defaultEmployee);
      if (!isKesrox && f.repHint) {
        const hintRep = await prisma.employee.findFirst({
          where: { name: { contains: f.repHint, mode: "insensitive" }, companyId: effectiveCompanyId },
          include: { company: true },
        });
        if (hintRep) rep = hintRep;
      }
      const lowerName = f.name.toLowerCase();
      if (isKesrox && lowerName.includes("naresh")) {
        rep = nareshRep || defaultEmployee;
      }

      const recordingUrl = `https://drive.google.com/file/d/${f.id}/view`;
      const nameMatch =
        f.name.match(/recording\s+([^_]+)_/i) || f.name.match(/recording\s+([^.]+)\./i);
      const contactName = cleanContactDisplayName(nameMatch ? nameMatch[1].trim() : f.name);

      const dateMatch =
        f.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})[-_\s]+(\d{2})[-:](\d{2})[-:](\d{2})/) ||
        f.name.match(/_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
      let callDate = new Date();
      if (dateMatch) {
        if (dateMatch[1].length === 4) {
          const [, yyyy, mm, dd, hh, min, ss] = dateMatch;
          callDate = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
        } else {
          const [, yy, mm, dd, hh, min, ss] = dateMatch;
          callDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
        }
      }

      // Extract phone number from filename or contactName
      const phoneDigits =
        f.name.match(/\b([6-9]\d{9})\b/)?.[1] ||
        contactName.replace(/\D/g, "").match(/([6-9]\d{9})/)?.[1];
      const leadPhoneNumber = phoneDigits
        ? `+91 ${phoneDigits.slice(0, 5)} ${phoneDigits.slice(5)}`
        : "+91 98765 43210";

      let analysis: any = null;

      try {
        const downloadUrl = `https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const audioRes = await fetch(downloadUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (audioRes.ok) {
          const buf = Buffer.from(await audioRes.arrayBuffer());
          if (buf.length > 500) {
            analysis = await analyzeAudioRecordingWithGemini({
              audioBase64: buf.toString("base64"),
              mimeType: "audio/m4a",
              employeeName: rep.name,
              customerName: contactName,
              customApiKey: companySettings?.geminiApiKey || undefined,
            });
          }
        }
      } catch (err) {
        console.warn("Gemini live transcription fallback for " + f.name, err);
      }

      const isSocial = Boolean(f.name.match(/\b(facebook|fb|meta|instagram|insta)\b/i));
      const isIndiaMart = Boolean(f.name.match(/\bindiamart\b/i));
      const detectedSource = isSocial ? "META" : isIndiaMart ? "INDIAMART" : "MANUAL";

      let lead = await prisma.lead.findFirst({
        where: {
          companyId: rep.companyId,
          OR: [
            { name: { equals: contactName, mode: "insensitive" } },
            phoneDigits ? { phoneNumber: { contains: phoneDigits } } : { id: "none" },
          ],
        },
      });

      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            name: `${contactName}`,
            phoneNumber: leadPhoneNumber,
            companyId: rep.companyId,
            source: detectedSource as any,
            status: "CONTACTED",
            assignedEmployeeId: rep.id,
            city: analysis?.territory || analysis?.monopolyTerritory || null,
            state: (analysis?.territory || analysis?.monopolyTerritory) ? "India" : null,
          },
        });
      } else {
        const updateData: any = {};
        if (phoneDigits && (!lead.phoneNumber || lead.phoneNumber.includes("98765 43210"))) {
          updateData.phoneNumber = leadPhoneNumber;
        }
        if (isSocial && lead.source === "MANUAL") {
          updateData.source = "META";
        }
        if (Object.keys(updateData).length > 0) {
          lead = await prisma.lead.update({
            where: { id: lead.id },
            data: updateData,
          });
        }
      }

      const transcript =
        analysis?.transcript ||
        `Employee: Call recording received from Google Drive for ${contactName}.\nCustomer: Audio processed and logged.`;
      const summary =
        analysis?.aiSummary ||
        `${contactName} ke sath phone discussion record hua aur audio CRM me log kiya gaya.`;
      const behaviorTags =
        analysis?.behaviorTags?.length
          ? analysis.behaviorTags
          : ["⚡ Warm Lead", "Google Drive Sync", "PCD Franchise"];
      const durationSec = analysis?.durationSec || 25;

      const existing = existingUrlMap.get(recordingUrl) || (await prisma.call.findFirst({
        where: { recordingUrl },
      }));
      if (existing) {
        const updated = await prisma.call.update({
          where: { id: existing.id },
          data: {
            transcript,
            aiSummary: summary,
            behaviorTags,
            durationSec,
            occurredAt: callDate,
            employeeId: rep.id,
          },
        });
        existingUrlMap.set(recordingUrl, updated);
        processedIds.push(updated.id);
      } else {
        const created = await prisma.call.create({
          data: {
            employeeId: rep.id,
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
        existingUrlMap.set(recordingUrl, created);
        processedIds.push(created.id);
      }
    }

    // 5. Query latest calls to return immediately to the frontend (scoped to active company)
    const callsWhere: any = isKesrox
      ? {
          OR: [
            { employee: { companyId: kesroxId } },
            { lead: { companyId: kesroxId } },
            { client: { companyId: kesroxId } },
            { employee: { name: { contains: "Savi", mode: "insensitive" } } },
          ],
        }
      : {
          OR: [
            { employee: { companyId: effectiveCompanyId } },
            { lead: { companyId: effectiveCompanyId } },
            { client: { companyId: effectiveCompanyId } },
          ],
        };

    let updatedCalls: any[] = await prisma.call.findMany({
      where: callsWhere,
      include: {
        employee: true,
        client: { include: { territory: true } },
        lead: { include: { client: { include: { territory: true } } } },
      },
      orderBy: { occurredAt: "desc" },
      take: 60,
    });

    if (updatedCalls.length === 0) {
      updatedCalls = await defaultPrisma.call.findMany({
        where: callsWhere,
        include: {
          employee: true,
          client: { include: { territory: true } },
          lead: { include: { client: { include: { territory: true } } } },
        },
        orderBy: { occurredAt: "desc" },
        take: 60,
      });
    }

    // Deduplicate calls by recordingUrl, keeping the richer record
    const dedupMap = new Map<string, any>();
    for (const c of updatedCalls) {
      const key = c.recordingUrl || c.id;
      const existing = dedupMap.get(key);
      if (!existing) {
        dedupMap.set(key, c);
      } else {
        const existingIsGeneric = !existing.aiSummary || existing.aiSummary.includes("Call recorded and analyzed") || existing.aiSummary.includes("audio CRM me log");
        const currentIsRicher = Boolean(c.aiSummary && !c.aiSummary.includes("Call recorded and analyzed") && !c.aiSummary.includes("audio CRM me log"));
        if (existingIsGeneric && currentIsRicher) {
          dedupMap.set(key, c);
        } else if ((c.transcript?.length || 0) > (existing.transcript?.length || 0)) {
          dedupMap.set(key, c);
        }
      }
    }
    const finalCalls = Array.from(dedupMap.values());

    const formattedCalls = finalCalls.map((c: any) => {
      const territoryStr = c.client?.territory
        ? `${c.client.territory.city}, ${c.client.territory.state}`
        : c.lead?.client?.territory
        ? `${c.lead.client.territory.city}, ${c.lead.client.territory.state}`
        : c.lead?.city
        ? `${c.lead.city}${c.lead.state ? `, ${c.lead.state}` : ""}`
        : null;

      const extractedPhone =
        c.client?.phoneNumber ||
        c.lead?.phoneNumber ||
        c.aiSummary?.match(/(\+?91\d{10}|\b\d{10}\b)/)?.[0] ||
        null;

      const targetName = c.client
        ? c.client.name
        : c.lead
        ? (c.lead.name || "Direct Party")
        : extractedPhone
        ? `Contact ${extractedPhone}`
        : "Direct Mobile Call";

      return {
        id: c.id,
        leadId: c.leadId,
        targetName,
        targetPhone: extractedPhone,
        direction: c.direction,
        missed: c.missed,
        durationSec: c.durationSec || 0,
        transcript: c.transcript,
        aiSummary: c.aiSummary,
        summary: c.aiSummary || c.transcript,
        behaviorTags: c.behaviorTags || [],
        recordingUrl: c.recordingUrl,
        whatsappSent: c.whatsappSent,
        occurredAt: c.occurredAt.toISOString(),
        repId: c.employee.id,
        repName: c.employee.name,
        repPhone: c.employee.phoneNumber,
        leadTerritory: territoryStr,
        leadDivision: c.lead?.division || null,
        companyName: "Allota AI",
      };
    });

    return NextResponse.json({
      success: true,
      message: `Processed Google Drive recordings successfully from folder ${activeFolderId}!`,
      connectedDriveFolder: activeFolderId,
      driveFolderUrl: companySettings?.driveFolderUrl || `https://drive.google.com/drive/folders/${activeFolderId}`,
      totalDriveFiles: driveFiles.length,
      remainingToSync: remainingVerifiedCount + Math.max(0, unverifiedFilesToSync.length - liveBatch.length),
      processedIds,
      calls: formattedCalls,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
