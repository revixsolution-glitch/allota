import Link from "next/link";
import { getSession } from "@/lib/auth";
import { completeFollowupTask, updateEmployeeLeadStatus } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";

export default async function EmployeeDashboardPage() {
  const session = await getSession();
  const employeeId = session?.employeeId;

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

  const [
    employee,
    clientCount,
    leads,
    divisionStats,
    callsToday,
    totalCallsCount,
    pendingTasks,
    recentAllotments,
  ] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.client.count({ where: { assignedEmployeeId: employeeId } }),
    prisma.lead.findMany({
      where: { assignedEmployeeId: employeeId },
      include: {
        _count: { select: { calls: true } },
        reassignmentLogs: { take: 1, orderBy: { reassignedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.lead.groupBy({
      by: ["division"],
      where: { assignedEmployeeId: employeeId },
      _count: { _all: true },
    }),
    prisma.call.count({
      where: {
        employeeId,
        occurredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.call.count({ where: { employeeId } }),
    prisma.followupTask.findMany({
      where: {
        assignedEmployeeId: employeeId,
        status: "PENDING",
      },
      include: {
        client: {
          include: { territory: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Check if any leads were allotted or reassigned to this employee in last 7 days
    prisma.leadReassignmentLog.findMany({
      where: { toEmployeeId: employeeId },
      include: { lead: true },
      orderBy: { reassignedAt: "desc" },
      take: 3,
    }),
  ]);

  const pcdCount =
    divisionStats.find((d) => d.division === "PCD_FRANCHISE")?._count._all || 0;
  const tpCount =
    divisionStats.find((d) => d.division === "THIRD_PARTY")?._count._all || 0;
  const totalLeads = pcdCount + tpCount;

  return (
    <div className="space-y-7">
      {/* Top Rep Greeting Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary/80 bg-white">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Session
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Field Telecaller & Commercial Desk
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Welcome, {employee?.name}!
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Here is your synchronized telecalling pipeline. All leads allotted to you by Admin appear below 
              in real-time with direct call logging, division badges, and instant WhatsApp dialers.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center shrink-0">
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                My Leads
              </p>
              <p className="mt-1 text-2xl font-black text-ink">{totalLeads}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                PCD Franchise
              </p>
              <p className="mt-1 text-2xl font-black text-blue-700">{pcdCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Third-Party
              </p>
              <p className="mt-1 text-2xl font-black text-purple-700">{tpCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Total Calls
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{totalCallsCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Admin Allotments Notice (Connecting Employee with Admin Actions) */}
      {recentAllotments.length > 0 && (
        <section className="rounded-2xl p-4 bg-teal-50/80 border border-teal-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-teal-100 text-teal-800 text-sm">
                ⚡
              </span>
              <div>
                <p className="text-xs font-extrabold text-teal-900">
                  New Leads Allotted by Admin
                </p>
                <p className="text-[11px] text-teal-700 mt-0.5">
                  Latest: {recentAllotments[0].reason || "Direct bulk batch allocation"} • {new Date(recentAllotments[0].reassignedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <Link
              href="/employee/leads"
              className="text-xs font-bold text-teal-800 underline hover:text-teal-900"
            >
              View All In Allotments Desk &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* Assigned Leads Allotment Desk Preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">
              My Assigned Inquiries Workdesk
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Review prospect inquiries, update pipeline stages, and initiate instant follow-up
            </p>
          </div>
          <Link
            href="/employee/leads"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>View All {totalLeads} Allotted Leads</span>
            <span>&rarr;</span>
          </Link>
        </div>

        {leads.length === 0 ? (
          <div className="rounded-3xl p-10 text-center neo-panel bg-white border border-line">
            <p className="text-sm font-bold text-ink">Zero Inquiries Assigned Yet</p>
            <p className="text-xs text-ink-muted mt-1">
              When Admin allocates leads to your profile, they will appear here instantly.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3.5">Prospect</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Channel / Source</th>
                    <th className="px-4 py-3.5">Inquiry Details</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Instant Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.map((lead) => {
                    const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                    const isThirdParty = lead.division === "THIRD_PARTY";

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-ink text-sm">{lead.name}</p>
                          <p className="font-mono text-ink-muted text-xs mt-0.5">
                            {lead.phoneNumber}
                          </p>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isThirdParty
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {isThirdParty ? "Third-Party" : "PCD Franchise"}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-ink">{lead.source}</span>
                          {lead.sourceTag && (
                            <p className="text-[10px] text-ink-faint truncate max-w-[120px]">
                              🏷️ {lead.sourceTag}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="text-xs text-ink-muted truncate">
                            {lead.inquiryDetails || "Inquiry received"}
                          </p>
                        </td>

                        <td className="px-4 py-3.5">
                          <form action={updateEmployeeLeadStatus} className="flex items-center gap-1.5">
                            <input type="hidden" name="leadId" value={lead.id} />
                            <select
                              name="status"
                              defaultValue={lead.status}
                              className="h-7 rounded-lg border border-line bg-white px-1.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value={LeadStatus.ASSIGNED}>Assigned</option>
                              <option value={LeadStatus.CONTACTED}>Contacted</option>
                              <option value={LeadStatus.INTERESTED}>Interested</option>
                              <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                              <option value={LeadStatus.CONVERTED}>Converted ✓</option>
                            </select>
                            <button
                              type="submit"
                              className="h-7 rounded-lg bg-slate-100 hover:bg-primary hover:text-white text-ink px-2 text-[10px] font-bold transition cursor-pointer"
                            >
                              Save
                            </button>
                          </form>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {cleanPhone && (
                              <>
                                <a
                                  href={`tel:${cleanPhone}`}
                                  title="Call Prospect"
                                  className="h-7 w-7 rounded-lg bg-blue-50 text-blue-700 inline-flex items-center justify-center hover:bg-blue-100"
                                >
                                  📞
                                </a>
                                <a
                                  href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="WhatsApp Chat"
                                  className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-100"
                                >
                                  💬
                                </a>
                              </>
                            )}
                            <Link
                              href="/employee/leads"
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-primary hover:text-white transition"
                            >
                              Desk &rarr;
                            </Link>
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
      </section>

      {/* Assigned Reorder Follow-up Tasks */}
      <section className="rounded-3xl p-6 neo-panel bg-white border border-line">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-bold text-ink text-base">
              My Assigned Reorder Follow-up Tasks ({pendingTasks.length})
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Client reorders delegated by Admin to contact and confirm monthly medicine dispatch.
            </p>
          </div>
          <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 text-xs font-bold">
            Field Action Queue
          </span>
        </div>

        <div className="mt-4 divide-y divide-line-soft">
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-sm">{task.title}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                      task.priority === "URGENT"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : "bg-purple-100 text-purple-800 border-purple-200"
                    }`}
                  >
                    {task.priority}
                  </span>
                  <span className="text-xs text-ink-muted">
                    📍 {task.client.territory ? `${task.client.territory.city}, ${task.client.territory.state}` : "Area"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted max-w-2xl">{task.description}</p>
                <p className="text-[11px] text-ink-faint font-mono">
                  Client Contact: {task.client.phoneNumber || "No phone recorded"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <form action={completeFollowupTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✓</span> Mark Contact Completed
                  </button>
                </form>
              </div>
            </div>
          ))}

          {!pendingTasks.length && (
            <div className="py-8 text-center text-xs text-ink-faint">
              Zero pending reorder follow-ups assigned. You are completely caught up!
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
