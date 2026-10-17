import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Actually sends the reply back to Meta (posts a comment reply, or a
 * Messenger/Instagram DM). Comment replies need `pages_manage_engagement`;
 * message replies need `pages_messaging` / `instagram_manage_messages` —
 * permissions Meta grants only after App Review for live use. If Meta
 * declines the request, that real reason is shown, not a fake success.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeCompanyId = getActiveCompanyId(session);
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || "").trim();
  if (!text) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });

  const item = await prisma.socialInboxItem.findFirst({
    where: { id, ...scopeToCompany(activeCompanyId) },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({
    where: { companyId: activeCompanyId ?? undefined },
    select: { metaAccessToken: true, metaApiKey: true },
  });
  const accessToken = settings?.metaAccessToken || settings?.metaApiKey;
  if (!accessToken) {
    return NextResponse.json({ error: "No Meta access token is saved for this company yet." }, { status: 400 });
  }

  try {
    let metaRes: Response;
    if (item.kind === "COMMENT") {
      metaRes = await fetch(`https://graph.facebook.com/v19.0/${item.externalId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      });
    } else {
      metaRes = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: item.fromId },
          message: { text },
          messaging_type: "RESPONSE",
          access_token: accessToken,
        }),
      });
    }

    const metaJson = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      const message = metaJson?.error?.message || "Meta declined this reply.";
      return NextResponse.json({ error: message, metaCode: metaJson?.error?.code }, { status: 502 });
    }

    await prisma.socialInboxItem.update({
      where: { id: item.id },
      data: { status: "REPLIED", repliedText: text, repliedAt: new Date(), repliedByUserId: session.userId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Meta right now." }, { status: 500 });
  }
}
