import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

function dayBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

export default async function FollowUpsPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  const logs = await prisma.leadFollowUpLog.findMany({
    where: activeCompanyId ? { lead: { companyId: activeCompanyId } } : {},
    include: {
      lead: { select: { id: true, name: true, phoneNumber: true, followUpAt: true, status: true } },
      employee: { select: { name: true } },
    },
    orderBy: [{ leadId: "asc" }, { createdAt: "asc" }],
  });

  // Assign a 1st/2nd/3rd... sequence number per lead, then re-sort newest activity first.
  const sequenceByLeadId = new Map<string, number>();
  const withSequence = logs.map((log) => {
    const seq = (sequenceByLeadId.get(log.leadId) || 0) + 1;
    sequenceByLeadId.set(log.leadId, seq);
    return { ...log, sequence: seq };
  });
  withSequence.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayBounds(now);

  const totalScheduled = withSequence.length;
  const overdueCount = withSequence.filter(
    (l) => l.lead.followUpAt && l.scheduledFor.getTime() === l.lead.followUpAt.getTime() && l.scheduledFor < todayStart
  ).length;
  const todayCount = withSequence.filter(
    (l) =>
      l.lead.followUpAt &&
      l.scheduledFor.getTime() === l.lead.followUpAt.getTime() &&
      l.scheduledFor >= todayStart &&
      l.scheduledFor < todayEnd
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-sky-500/70 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
                Representative Activity Log
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Follow Ups</h1>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="rounded-2xl px-4 py-2.5 neo-pressed border border-line text-center">
              <p className="text-xl font-black text-ink">{totalScheduled}</p>
              <p className="text-[10px] font-semibold text-ink-faint">Scheduled</p>
            </div>
            <div className="rounded-2xl px-4 py-2.5 neo-pressed border border-amber-200 bg-amber-50 text-center">
              <p className="text-xl font-black text-amber-700">{todayCount}</p>
              <p className="text-[10px] font-semibold text-amber-700">Due Today</p>
            </div>
            <div className="rounded-2xl px-4 py-2.5 neo-pressed border border-rose-200 bg-rose-50 text-center">
              <p className="text-xl font-black text-rose-700">{overdueCount}</p>
              <p className="text-[10px] font-semibold text-rose-700">Overdue</p>
            </div>
          </div>
        </div>
      </section>

      {withSequence.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            📅
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Follow-Ups Scheduled Yet</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Once a representative sets a follow-up date on a lead, it will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3.5">Lead & Contact</th>
                  <th className="px-4 py-3.5">Representative</th>
                  <th className="px-4 py-3.5">Follow-Up #</th>
                  <th className="px-4 py-3.5">Scheduled For</th>
                  <th className="px-4 py-3.5">Set On</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {withSequence.map((log) => {
                  const isCurrent = log.lead.followUpAt?.getTime() === log.scheduledFor.getTime();
                  const isOverdue = isCurrent && log.scheduledFor < todayStart;
                  const isToday = isCurrent && log.scheduledFor >= todayStart && log.scheduledFor < todayEnd;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-ink">{log.lead.name || "Unnamed Prospect"}</p>
                        <p className="font-mono text-[11px] text-ink-muted">{log.lead.phoneNumber || "No phone"}</p>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-ink">{log.employee.name}</td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                          {log.sequence === 1 ? "1st" : log.sequence === 2 ? "2nd" : log.sequence === 3 ? "3rd" : `${log.sequence}th`} follow-up
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-ink">
                        {log.scheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3.5 text-ink-faint">
                        {log.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {!isCurrent ? (
                          <span className="text-[10px] font-bold text-ink-faint">Rescheduled</span>
                        ) : isOverdue ? (
                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            Overdue
                          </span>
                        ) : isToday ? (
                          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Due Today
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Upcoming
                          </span>
                        )}
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
