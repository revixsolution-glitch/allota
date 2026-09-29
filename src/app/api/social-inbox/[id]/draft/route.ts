import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { generateSimpleReply } from "@/lib/gemini-simple";

export const dynamic = "force-dynamic";

/** Drafts an AI reply to one Social Inbox item, using this company's own Gemini key. Saves the draft; a human still has to review and click Send. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeCompanyId = getActiveCompanyId(session);
  const { id } = await params;

  const item = await prisma.socialInboxItem.findFirst({
    where: { id, ...(activeCompanyId ? { companyId: activeCompanyId } : {}) },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({
    where: { companyId: activeCompanyId ?? undefined },
    select: { geminiApiKey: true },
  });
  const apiKey = settings?.geminiApiKey?.trim() || process.env.GEMINI_CHAT_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No Gemini API key is saved for this company yet." }, { status: 400 });
  }

  const platform = item.platform === "INSTAGRAM" ? "Instagram" : "Facebook";
  const kind = item.kind === "COMMENT" ? "public comment" : "direct message";
  const prompt = `You are replying, on behalf of a PCD pharma franchise / third-party manufacturing company, to a ${platform} ${kind} from a potential distributor or chemist.

Their message: "${item.text || "(no text)"}"

Write a short, warm, professional reply (1-3 sentences, Hinglish is fine if the message was in Hinglish). Ask for their city/state and what product category they're interested in, if that wasn't already said. Do not use markdown, headings, or quotes — just the reply text itself, ready to send as-is.`;

  const draft = await generateSimpleReply(apiKey, prompt);
  if (!draft) {
    return NextResponse.json({ error: "Couldn't generate a draft right now. Try again in a moment." }, { status: 502 });
  }

  await prisma.socialInboxItem.update({ where: { id: item.id }, data: { aiDraftReply: draft } });
  return NextResponse.json({ draft });
}
