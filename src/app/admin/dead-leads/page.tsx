import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { LeadStatus } from "@/generated/prisma/enums";
import { deleteLead, updateLeadActiveStatus, updateLead } from "@/lib/admin-actions";

async function deleteLeadAction(formData: FormData) {
  "use server";
  await deleteLead(formData);
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

export default async function DeadLeadsPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const [employees, deadLeads] = await Promise.all([
    prisma.employee.findMany({
      where: companyScope,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.lead.findMany({
      where: { status: LeadStatus.NOT_INTERESTED, ...companyScope },
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

  return (
    <div className="space-y-6">
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
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Dead Leads ({deadLeads.length})</h1>
            <p className="mt-1 text-xs text-ink-muted max-w-2xl">
              Inquiries marked Dead by a representative. Review the reasoning, reactivate if a lead was
              closed by mistake, or remove records that are no longer needed.
            </p>
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
                  const aiReason = buildAiReason(lead);
                  const lastCall = lead.calls[0];

                  return (
                    <tr key={lead.id} className="align-top hover:bg-slate-50/70 transition">
                      <td className="px-5 py-4">
                        <details className="group">
                          <summary className="cursor-pointer list-none select-none">
                            <p className="font-extrabold text-ink text-sm group-open:text-rose-700">
                              {lead.name || "Unnamed Prospect"}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                              {lead.phoneNumber || "No phone"}
                            </p>
                            <span className="mt-1 inline-block text-[10px] font-bold text-primary underline decoration-dotted">
                              View full history
                            </span>
                          </summary>

                          <div className="mt-3 w-80 max-w-[90vw] rounded-2xl border border-line bg-slate-50 p-3.5 space-y-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                Lead Details
                              </p>
                              <p className="text-[11px] text-ink">
                                {lead.city ? `${lead.city}, ${lead.state || ""}` : "Location not provided"}
                              </p>
                              <p className="text-[11px] text-ink-muted">
                                In CRM since {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                Call History ({lead.calls.length})
                              </p>
                              {lead.calls.length === 0 ? (
                                <p className="text-[11px] text-ink-faint">No calls logged.</p>
                              ) : (
                                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                                  {lead.calls.map((c) => (
                                    <div key={c.id} className="rounded-lg bg-white border border-line-soft p-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-ink">
                                          {c.missed ? "🔴 Missed" : "🟢 Connected"} • {c.durationSec}s
                                        </span>
                                        <span className="text-[10px] text-ink-faint">
                                          {new Date(c.occurredAt).toLocaleDateString("en-IN", {
                                            day: "numeric",
                                            month: "short",
                                          })}
                                        </span>
                                      </div>
                                      {c.aiSummary && (
                                        <p className="mt-1 text-[10px] text-ink-muted leading-relaxed">
                                          {truncate(c.aiSummary, 140)}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {lead.remarks.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                  Remarks ({lead.remarks.length})
                                </p>
                                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                                  {lead.remarks.map((r) => (
                                    <div key={r.id} className="rounded-lg bg-white border border-line-soft p-2">
                                      <p className="text-[10px] text-ink leading-relaxed">{r.remark}</p>
                                      <p className="mt-0.5 text-[9px] text-ink-faint font-semibold">
                                        — {r.employee.name}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <form action={updateLead} className="flex items-center gap-1.5 pt-2 border-t border-line-soft">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="status" value={LeadStatus.NOT_INTERESTED} />
                              <select
                                name="assignedEmployeeId"
                                defaultValue={lead.assignedEmployeeId ?? ""}
                                className="h-8 flex-1 rounded-lg border border-line bg-white px-2 text-[11px] font-semibold text-ink focus:outline-none"
                              >
                                <option value="">Unassigned</option>
                                {employees.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="h-8 shrink-0 rounded-lg bg-slate-200 hover:bg-slate-300 text-ink px-2.5 text-[11px] font-bold transition cursor-pointer"
                              >
                                Reassign
                              </button>
                            </form>
                          </div>
                        </details>
                      </td>

                      <td className="px-4 py-4">
                        <span className="font-semibold text-ink">{lead.source}</span>
                        {lead.sourceTag && (
                          <p className="text-[10px] text-ink-faint mt-0.5 truncate max-w-[140px]" title={lead.sourceTag}>
                            {lead.sourceTag}
                          </p>
                        )}
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
                        <p className="text-[11px] text-ink-muted leading-relaxed line-clamp-3">{aiReason}</p>
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
