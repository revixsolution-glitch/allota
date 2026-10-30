import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { LeadStatus } from "@/generated/prisma/enums";
import { deleteLead, updateLead, updateLeadActiveStatus } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

async function deleteLeadAction(formData: FormData) {
  "use server";
  await deleteLead(formData);
  redirect("/admin/dead-leads");
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 sm:p-6 neo-panel">
      <div className="mb-4 flex items-center gap-3 border-b border-line pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl">{icon}</span>
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-ink-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-ink-muted">{text}</p>
);

export default async function LeadHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  const lead = await prisma.lead.findFirst({
    where: { id, ...scopeToCompany(activeCompanyId) },
    include: {
      assignedEmployee: { select: { id: true, name: true } },
      remarks: { include: { employee: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      followUpLogs: { include: { employee: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      calls: {
        orderBy: { occurredAt: "desc" },
        select: { id: true, occurredAt: true, durationSec: true, missed: true, direction: true, aiSummary: true },
      },
    },
  });
  if (!lead) notFound();

  const employees = await prisma.employee.findMany({
    where: scopeToCompany(activeCompanyId),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const isDead = lead.status === LeadStatus.NOT_INTERESTED;
  const summaries = lead.calls.filter((c) => c.aiSummary && c.aiSummary.trim());
  const backHref = isDead ? "/admin/dead-leads" : "/admin/leads";
  const backLabel = isDead ? "Dead Leads" : "Lead Center";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-bold text-ink-muted hover:text-ink">
        &larr; Back to {backLabel}
      </Link>

      {/* Who is this lead */}
      <section
        className={`rounded-3xl border-2 bg-white p-5 sm:p-7 ${isDead ? "border-rose-200" : "border-emerald-200"}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${
                isDead ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${isDead ? "bg-rose-500" : "bg-emerald-500"}`} />
              {isDead ? "Dead lead" : "Active lead"}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold text-ink">{lead.name || "Unnamed prospect"}</h1>
            <p className="mt-1 text-xl font-bold text-ink-muted">{lead.phoneNumber || "No phone number"}</p>
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            {isDead ? (
              <form action={updateLeadActiveStatus}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="isDead" value="false" />
                <button
                  type="submit"
                  className="rounded-2xl bg-emerald-600 px-5 py-3 text-base font-bold text-white transition hover:bg-emerald-700"
                >
                  ↺ Make this lead active again
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 text-base sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-ink-faint">Location</dt>
            <dd className="font-bold text-ink">
              {[lead.city, lead.state].filter(Boolean).join(", ") || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-faint">Handled by</dt>
            <dd className="font-bold text-ink">{lead.assignedEmployee?.name || "Nobody yet"}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-faint">Came from</dt>
            <dd className="font-bold text-ink">
              {lead.source}
              {lead.sourceTag ? ` • ${lead.sourceTag}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-faint">Added to CRM</dt>
            <dd className="font-bold text-ink">{fmtDate(lead.createdAt)}</dd>
          </div>
          {isDead && (
            <div>
              <dt className="text-sm font-semibold text-ink-faint">Marked dead on</dt>
              <dd className="font-bold text-rose-700">{lead.deadAt ? fmtDate(lead.deadAt) : "Date not recorded"}</dd>
            </div>
          )}
          {lead.inquiryDetails && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-semibold text-ink-faint">What they asked for</dt>
              <dd className="text-ink">{lead.inquiryDetails}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            { n: lead.followUpLogs.length, label: "Follow-ups" },
            { n: lead.remarks.length, label: "Remarks" },
            { n: lead.calls.length, label: "Calls" },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl bg-slate-50 py-3">
              <p className="text-2xl font-extrabold text-ink">{x.n}</p>
              <p className="text-sm font-semibold text-ink-muted">{x.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Follow-ups */}
      <Section icon="📅" title="Follow-up history" count={lead.followUpLogs.length}>
        {lead.followUpLogs.length === 0 ? (
          <Empty text="No follow-up was ever scheduled for this lead." />
        ) : (
          <ol className="space-y-3">
            {lead.followUpLogs.map((f, i) => (
              <li key={f.id} className="flex gap-3 rounded-2xl bg-sky-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-base font-bold text-ink">
                    {ordinal(i + 1)} follow-up — planned for {fmtDate(f.scheduledFor)}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Set by {f.employee.name} on {fmtDateTime(f.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Remarks */}
      <Section icon="📝" title="Remarks from the team" count={lead.remarks.length}>
        {lead.remarks.length === 0 ? (
          <Empty text="Nobody wrote a remark on this lead." />
        ) : (
          <ul className="space-y-3">
            {lead.remarks.map((r) => (
              <li key={r.id} className="rounded-2xl bg-amber-50 p-4">
                <p className="text-base leading-relaxed text-ink">{r.remark}</p>
                <p className="mt-2 text-sm font-semibold text-ink-muted">
                  {r.employee.name} • {fmtDateTime(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* AI summaries */}
      <Section icon="🤖" title="AI call summaries" count={summaries.length}>
        {lead.calls.length === 0 ? (
          <Empty text="No calls were made to this lead." />
        ) : summaries.length === 0 ? (
          <Empty text={`${lead.calls.length} call(s) were made, but no AI summary is available.`} />
        ) : (
          <ul className="space-y-3">
            {summaries.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/calls?callId=${c.id}`}
                  className="group block rounded-2xl bg-gradient-to-r from-violet-50/90 to-sky-50/90 hover:from-violet-100 hover:to-sky-100 border border-violet-200/80 p-4 transition-all duration-150 shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-violet-950 flex items-center gap-1.5">
                      <span>🎙️</span>
                      <span>{fmtDateTime(c.occurredAt)} • {c.missed ? "Call not answered" : `Talked for ${Math.max(1, Math.round((c.durationSec || 0) / 60))} min`}</span>
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 bg-white/90 group-hover:bg-violet-700 group-hover:text-white px-2.5 py-1 rounded-xl border border-violet-200 shadow-2xs transition">
                      <span>Open in AI Call Summaries</span>
                      <span>↗</span>
                    </span>
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-ink group-hover:text-violet-950">{c.aiSummary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Actions */}
      <section className="rounded-3xl border border-line bg-white p-5 sm:p-6 neo-panel">
        <h2 className="text-lg font-extrabold text-ink">What do you want to do?</h2>
        <form action={updateLead} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="status" value={lead.status} />
          <label className="text-sm font-bold text-ink-muted sm:w-40">Give to another rep</label>
          <select
            name="assignedEmployeeId"
            defaultValue={lead.assignedEmployeeId ?? ""}
            className="h-11 flex-1 rounded-xl border border-line bg-white px-3 text-base font-semibold text-ink"
          >
            <option value="">Nobody (unassigned)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-xl bg-slate-800 px-5 text-base font-bold text-white transition hover:bg-slate-900"
          >
            Save
          </button>
        </form>
        {isDead && (
          <form action={deleteLeadAction} className="mt-4 border-t border-line pt-4">
            <input type="hidden" name="leadId" value={lead.id} />
            <button
              type="submit"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 transition hover:bg-rose-100"
            >
              🗑 Delete this lead for good
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
