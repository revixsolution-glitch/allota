import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const supabaseUrl =
  "postgresql://postgres.uwsaspezgiauxxvmjdcv:%2F*PL%25%26Zq8ecyj%26Q@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const adapter = new PrismaPg({ connectionString: supabaseUrl });
const prisma = new PrismaClient({ adapter });

async function exportData() {
  console.log("Fetching Savi/Kesrox calls from Supabase...");

  const calls = await prisma.call.findMany({
    where: {
      employee: {
        companyId: "cmubi8zf6000004l8y45hhuds",
      },
      aiSummary: { not: null },
    },
    include: {
      employee: { select: { id: true, name: true, phoneNumber: true } },
      lead: { select: { id: true, name: true, phoneNumber: true, division: true, city: true, state: true } },
    },
    orderBy: { occurredAt: "desc" },
  });

  console.log(`Fetched ${calls.length} calls with AI summaries.`);

  const exportDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // 1. Complete JSON file
  const jsonPath = path.join(exportDir, "savi_ai_calls_complete.json");
  fs.writeFileSync(jsonPath, JSON.stringify(calls, null, 2), "utf8");
  console.log(`✓ Saved complete JSON to: ${jsonPath}`);

  // 2. Training JSONL (Instruction / Context / Response format for LLM fine-tuning)
  const jsonlPath = path.join(exportDir, "savi_ai_calls_training.jsonl");
  const jsonlStream = fs.createWriteStream(jsonlPath, { encoding: "utf8" });

  for (const c of calls) {
    if (!c.transcript || !c.aiSummary) continue;

    // Format A: Agent Conversation Simulation
    const record = {
      id: c.id,
      timestamp: c.occurredAt,
      caller: c.employee?.name || "Savi",
      leadName: c.lead?.name || "Customer",
      phoneNumber: c.lead?.phoneNumber || "Confidential",
      division: c.lead?.division || "PHARMA",
      behaviorTags: c.behaviorTags || [],
      messages: [
        {
          role: "system",
          content:
            "You are Savi, a top-performing pharma telecalling sales representative for Kesrox Healthcare (PCD Franchise & Third-Party Manufacturing). You speak naturally in professional, polite Hindi/Hinglish, explain product availability, batch sizes, pricing, and qualify distributor leads.",
        },
        {
          role: "user",
          content: `Analyze this customer phone call recording transcript and provide the executive commercial summary, customer interest level, and next follow-up action:\n\nTRANSCRIPT:\n${c.transcript}`,
        },
        {
          role: "assistant",
          content: `BEHAVIOR TAGS: ${(c.behaviorTags || []).join(", ")}\n\nAI SUMMARY & COMMERCIAL INTELLIGENCE:\n${c.aiSummary}`,
        },
      ],
      rawTranscript: c.transcript,
      aiSummary: c.aiSummary,
    };

    jsonlStream.write(JSON.stringify(record) + "\n");
  }
  jsonlStream.end();
  console.log(`✓ Saved fine-tuning JSONL dataset to: ${jsonlPath}`);

  // 3. Human-readable Comprehensive Markdown Document
  const mdPath = path.join(exportDir, "savi_ai_summaries_master_doc.md");
  const mdStream = fs.createWriteStream(mdPath, { encoding: "utf8" });

  mdStream.write("# Kesrox Healthcare — Savi Telecalling & AI Summaries Knowledge Base\n\n");
  mdStream.write(`> Generated on: ${new Date().toISOString()}\n`);
  mdStream.write(`> Total Calls Captured: ${calls.length}\n`);
  mdStream.write(`> Source: Kesrox Healthcare PCD Pharma & Third-Party Manufacturing Audio Calls\n\n`);
  mdStream.write("---\n\n");

  let callIndex = 1;
  for (const c of calls) {
    const contactName = c.lead?.name || "Customer / Doctor / Distributor";
    const phone = c.lead?.phoneNumber || "N/A";
    const dateStr = c.occurredAt ? new Date(c.occurredAt).toLocaleDateString("en-IN") : "N/A";
    const tags = (c.behaviorTags || []).map((t: string) => `\`${t}\``).join(" ");

    mdStream.write(`## Call #${callIndex}: ${contactName} (${phone})\n\n`);
    mdStream.write(`- **Date:** ${dateStr}\n`);
    mdStream.write(`- **Representative:** ${c.employee?.name || "Savi Kesrox"}\n`);
    mdStream.write(`- **Direction:** ${c.direction || "OUTBOUND"}\n`);
    mdStream.write(`- **Tags:** ${tags || "None"}\n`);
    if (c.recordingUrl) {
      mdStream.write(`- **Recording Link:** [Audio File](${c.recordingUrl})\n`);
    }
    mdStream.write("\n### 🧠 AI Commercial Summary\n\n");
    mdStream.write(`${c.aiSummary?.trim()}\n\n`);

    if (c.transcript && c.transcript.trim().length > 0) {
      mdStream.write("### 🎙️ Full Call Transcript\n\n");
      mdStream.write("```text\n");
      mdStream.write(c.transcript.trim());
      mdStream.write("\n```\n\n");
    }

    mdStream.write("---\n\n");
    callIndex++;
  }

  mdStream.end();
  console.log(`✓ Saved master Markdown training doc to: ${mdPath}`);

  await prisma.$disconnect();
}

exportData().catch(console.error);
