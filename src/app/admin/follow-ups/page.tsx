import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeViaRelation } from "@/lib/auth";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";

function dayBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

export default async function FollowUpsPage({
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

  const dateWhere = dateFilter.start && dateFilter.end
    ? { scheduledFor: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { scheduledFor: { gte: dateFilter.start } }
    : {};

  const logs = await prisma.leadFollowUpLog.findMany({
    where: {
      ...scopeViaRelation(activeCompanyId, "lead"),
      ...dateWhere,
      ...(employeeId ? { employeeId } : {}),
    },
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

  const repName = employeeId
    ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }))?.name ?? null
    : null;

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
      {repName && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900">
          Showing only <strong>{repName}</strong>
          <Link href="/admin/follow-ups" className="ml-auto text-xs font-bold text-sky-700 underline">Show everyone</Link>
        </div>
      )}
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
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Follow <GradientText>Ups</GradientText></h1>
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
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
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

          {/* Mobile Touch Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {withSequence.map((log) => {
              const isCurrent = log.lead.followUpAt?.getTime() === log.scheduledFor.getTime();
              const isOverdue = isCurrent && log.scheduledFor < todayStart;
              const isToday = isCurrent && log.scheduledFor >= todayStart && log.scheduledFor < todayEnd;
              const cleanPhone = (log.lead.phoneNumber || "").replace(/\D/g, "");

              return (
                <div key={log.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-ink text-base">{log.lead.name || "Unnamed Prospect"}</p>
                      <p className="font-mono text-xs text-ink-muted mt-0.5">{log.lead.phoneNumber || "No phone"}</p>
                    </div>
                    <div>
                      {!isCurrent ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-faint">
                          Rescheduled
                        </span>
                      ) : isOverdue ? (
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                          Overdue
                        </span>
                      ) : isToday ? (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Due Today
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                      {log.sequence === 1 ? "1st" : log.sequence === 2 ? "2nd" : log.sequence === 3 ? "3rd" : `${log.sequence}th`} follow-up
                    </span>
                    <span className="text-ink-muted text-xs">
                      Rep: <strong className="text-ink">{log.employee.name}</strong>
                    </span>
                    <span className="text-ink-faint text-[11px]">
                      Scheduled: <strong>{log.scheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
                    </span>
                  </div>

                  {cleanPhone && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-line-soft">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 py-1.5 text-xs font-bold text-blue-700 active:bg-blue-100 transition"
                      >
                        <span>📞</span>
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 py-1.5 text-xs font-bold text-emerald-700 active:bg-emerald-100 transition"
                      >
                        <span>💬</span>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
