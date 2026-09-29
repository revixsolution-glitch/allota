import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { GradientText } from "@/components/GradientText";
import { SocialInboxCard } from "@/components/SocialInboxCard";

export const dynamic = "force-dynamic";

export default async function SocialInboxPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    redirect("/login");
  }
  const activeCompanyId = getActiveCompanyId(session);

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
        select: { enableSocialInbox: true },
      })
    : null;

  if (!settings?.enableSocialInbox) {
    redirect("/admin/leads");
  }

  const items = await prisma.socialInboxItem.findMany({
    where: { ...(activeCompanyId ? { companyId: activeCompanyId } : {}) },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const newCount = items.filter((i) => i.status === "NEW").length;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl px-7 py-6 neo-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Social <GradientText>Inbox</GradientText>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Comments and messages from Facebook and Instagram, in one place. AI drafts a reply — you review and send it.
            </p>
          </div>
          {newCount > 0 && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs font-bold text-sky-800">
              {newCount} new
            </span>
          )}
        </div>
      </section>

      {items.length === 0 ? (
        <section className="rounded-3xl border border-line bg-white p-10 text-center neo-panel">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">💬</div>
          <h3 className="mt-3 text-sm font-bold text-ink">Nothing here yet</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Comments and messages on your connected Facebook/Instagram pages will show up here as they come in.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {items.map((item) => (
            <SocialInboxCard
              key={item.id}
              item={{
                id: item.id,
                platform: item.platform as "FACEBOOK" | "INSTAGRAM",
                kind: item.kind as "COMMENT" | "MESSAGE",
                fromName: item.fromName,
                fromId: item.fromId,
                text: item.text,
                status: item.status as "NEW" | "REPLIED" | "IGNORED",
                aiDraftReply: item.aiDraftReply,
                repliedText: item.repliedText,
                receivedAt: item.receivedAt.toISOString(),
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
