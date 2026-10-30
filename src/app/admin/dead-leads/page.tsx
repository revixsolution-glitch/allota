import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { LeadStatus } from "@/generated/prisma/enums";
import { deleteLead, updateLeadActiveStatus } from "@/lib/admin-actions";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { SourceBadge } from "@/components/SourceBadge";

async function deleteLeadAction(formData: FormData) {
  "use server";
  await deleteLead(formData);
  redirect("/admin/dead-leads");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}

function buildAiReason(lead: {
  inquiryDetails: string | null;
  calls: { aiSummary: string | null; occurredAt: Date }[];
}): string {
  const latestCallWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
  if (latestCallWithSummary?.aiSummary) {
    return truncate(latestCallWithSummary.aiSummary, 220);
  }
  if (lead.inquiryDetails) {
    return truncate(lead.inquiryDetails, 220);
  }
  return "No AI call summary or inquiry notes on record for this lead.";
}

export default async function DeadLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ employeeId?: string; range?: string; from?: string; to?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const employeeId = resolvedParams.employeeId || "";
  const dateFilter = parseDashboardDateFilter(
    resolvedParams.range,
    resolvedParams.from,
    resolvedParams.to
  );

  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = scopeToCompany(activeCompanyId);

  const dateWhere = dateFilter.start && dateFilter.end
    ? { updatedAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { updatedAt: { gte: dateFilter.start } }
    : {};

  const [deadLeads] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: LeadStatus.NOT_INTERESTED,
        ...companyScope,
        ...dateWhere,
        ...(employeeId ? { assignedEmployeeId: employeeId } : {}),
      },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        calls: {
          orderBy: { occurredAt: "desc" },
          select: { id: true, occurredAt: true, durationSec: true, missed: true, aiSummary: true, direction: true },
        },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ deadAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const repName = employeeId
    ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }))?.name ?? null
    : null;

  return (
    <div className="space-y-6">
      {repName && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900">
          Showing only <strong>{repName}</strong>
          <Link href="/admin/dead-leads" className="ml-auto text-xs font-bold text-sky-700 underline">Show everyone</Link>
        </div>
      )}
      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-rose-500/70 bg-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Closed-Out Inquiries
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Dead <GradientText>Leads</GradientText> ({deadLeads.length})</h1>
          </div>
        </div>
      </section>

      {deadLeads.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            ✅
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Dead Leads</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Every inquiry in the pipeline is still active.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3.5">Lead & Contact</th>
                  <th className="px-4 py-3.5">Source</th>
                  <th className="px-4 py-3.5">Assigned Rep</th>
                  <th className="px-4 py-3.5">Marked Dead</th>
                  <th className="px-4 py-3.5">Calls Logged</th>
                  <th className="px-4 py-3.5 max-w-xs">AI Reason</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deadLeads.map((lead) => {
                  const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
                  const aiReason = buildAiReason(lead);
                  const lastCall = lead.calls[0];

                  return (
                    <tr key={lead.id} className="align-top hover:bg-slate-50/70 transition">
                      <td className="px-5 py-4">
                        <Link href={`/admin/lead-history/${lead.id}`} className="group block">
                          <p className="font-extrabold text-ink text-sm group-hover:text-rose-700">
                            {lead.name || "Unnamed Prospect"}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                            {lead.phoneNumber || "No phone"}
                          </p>
                          <span className="mt-1.5 inline-block rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-1 text-[11px] font-bold text-sky-800 group-hover:bg-sky-100">
                            Open full history →
                          </span>
                        </Link>
                      </td>

                      <td className="px-4 py-4">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>

                      <td className="px-4 py-4">
                        {lead.assignedEmployee ? (
                          <span className="font-semibold text-ink">{lead.assignedEmployee.name}</span>
                        ) : (
                          <span className="text-ink-faint">Unassigned</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-ink-muted">
                        {lead.deadAt
                          ? new Date(lead.deadAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>

                      <td className="px-4 py-4">
                        <span className="font-bold text-ink">{lead.calls.length}</span>
                        {lastCall && (
                          <p className="text-[10px] text-ink-faint mt-0.5">
                            Last: {new Date(lastCall.occurredAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 max-w-xs">
                        {callWithSummary ? (
                          <Link
                            href={`/admin/calls?callId=${callWithSummary.id}`}
                            className="group block rounded-xl bg-violet-50/80 hover:bg-violet-100 border border-violet-200/80 p-2.5 transition shadow-2xs hover:shadow-xs"
                            title="Open full AI summary & call recording"
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-violet-900 mb-1">
                              <span className="inline-flex items-center gap-1">
                                <span>🤖</span>
                                <span>AI Call Summary</span>
                              </span>
                              <span className="text-violet-600 group-hover:text-violet-900 flex items-center gap-0.5">
                                <span>Open in AI Calls</span>
                                <span>↗</span>
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700 leading-relaxed line-clamp-3 group-hover:text-violet-950">
                              {callWithSummary.aiSummary}
                            </p>
                          </Link>
                        ) : (
                          <p className="text-[11px] text-ink-muted leading-relaxed line-clamp-3">{aiReason}</p>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <form action={updateLeadActiveStatus}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="isDead" value="false" />
                            <button
                              type="submit"
                              className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                            >
                              ↺ Reactivate
                            </button>
                          </form>
                          <form action={deleteLeadAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 transition cursor-pointer"
                            >
                              🗑 Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
