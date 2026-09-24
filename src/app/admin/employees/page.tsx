import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { AddEmployeeModal } from "@/components/AddEmployeeModal";
import { SOURCE_META, SELECTABLE_SOURCES, HIDDEN_SOURCES } from "@/lib/lead-sources";
import { LeadSource } from "@/generated/prisma/enums";
import { addSourceEmployeeMapping, removeSourceEmployeeMapping } from "@/lib/admin-actions";
import { SourceIcon } from "@/components/SourceIcon";

function formatINR(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

import { parseDashboardDateFilter } from "@/lib/date-filters";

export const dynamic = "force-dynamic";

interface AdminEmployeesPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
    source?: string;
  }>;
}

export default async function AdminEmployeesPage(props: AdminEmployeesPageProps) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);

  const searchParams = props.searchParams ? await props.searchParams : {};
  const dateFilter = parseDashboardDateFilter(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const leadDateFilter =
    dateFilter.start && dateFilter.end
      ? { createdAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { createdAt: { gte: dateFilter.start } }
      : {};

  const callDateFilter =
    dateFilter.start && dateFilter.end
      ? { occurredAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { occurredAt: { gte: dateFilter.start } }
      : {};

  const orderDateFilter =
    dateFilter.start && dateFilter.end
      ? { orderDate: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { orderDate: { gte: dateFilter.start } }
      : {};

  const selectedSource =
    searchParams.source && Object.values(LeadSource).includes(searchParams.source as LeadSource)
      ? (searchParams.source as LeadSource)
      : null;

  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({ where: { companyId: activeCompanyId } })
    : await prisma.companySettings.findFirst();
  const isCorePlan = !settings?.enableBillingErp && !settings?.enableClientsManagement;

  const [employees, sourceAssignments] = await Promise.all([
    prisma.employee.findMany({
      where: companyScope,
      include: {
        user: true,
        clients: {
          include: {
            orders: Object.keys(orderDateFilter).length > 0 ? { where: orderDateFilter } : true,
            territory: true,
          },
        },
        leads: Object.keys(leadDateFilter).length > 0 ? { where: leadDateFilter } : true,
        calls: Object.keys(callDateFilter).length > 0 ? { where: callDateFilter } : true,
        tasks: true,
        sessions: {
          orderBy: { loginTime: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.leadSourceAssignment.findMany({
      where: companyScope,
      select: { id: true, source: true, employeeId: true },
    }),
  ]);

  const sourceCounts = new Map<LeadSource, number>();
  for (const a of sourceAssignments) {
    sourceCounts.set(a.source, (sourceCounts.get(a.source) || 0) + 1);
  }

  const sourcesByEmployee = new Map<string, { id: string; source: LeadSource }[]>();
  for (const a of sourceAssignments) {
    const list = sourcesByEmployee.get(a.employeeId) || [];
    list.push({ id: a.id, source: a.source });
    sourcesByEmployee.set(a.employeeId, list);
  }

  // Hidden sources (WhatsApp, Social) never show, even if an old assignment exists.
  const visibleAssignments = (employeeId: string) =>
    (sourcesByEmployee.get(employeeId) || []).filter((a) => !HIDDEN_SOURCES.includes(a.source));

  const dedicatedEmployeeIds = selectedSource
    ? new Set(
        sourceAssignments.filter((a) => a.source === selectedSource).map((a) => a.employeeId)
      )
    : null;

  const visibleEmployees = dedicatedEmployeeIds
    ? employees.filter((e) => dedicatedEmployeeIds.has(e.id))
    : employees;

  return (
    <div className="space-y-7">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-purple-500/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 border border-purple-200">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                Sales Force Team & Field Operations
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">
              Employee{" "}
              <span className="bg-[linear-gradient(135deg,#38bdf8,#a855f7_52%,#fb923c)] bg-clip-text text-transparent">
                Management
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <AddEmployeeModal />

            <div className="rounded-2xl px-5 py-3 neo-pressed border border-line text-center">
              <p className="text-3xl font-black text-purple-600">{visibleEmployees.length}</p>
              <p className="text-xs font-semibold text-ink-faint">
                {selectedSource ? "Dedicated to Source" : "Active Representatives"}
              </p>
            </div>
          </div>
        </div>

        {/* Source Filter Chips */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Link
            href="/admin/employees"
            className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
              !selectedSource
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-canvas text-ink-muted hover:text-ink border border-line"
            }`}
          >
            All Employees ({employees.length})
          </Link>
          {SELECTABLE_SOURCES.map((s) => (
            <Link
              key={s.value}
              href={`/admin/employees?source=${s.value}`}
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                selectedSource === s.value
                  ? "bg-primary text-white shadow-xs"
                  : "bg-canvas text-ink-muted hover:text-ink border border-line"
              }`}
            >
              <SourceIcon source={s.value} className="h-3.5 w-3.5 shrink-0" />
              <span>
                {s.label} ({sourceCounts.get(s.value) || 0})
              </span>
            </Link>
          ))}
        </div>
      </section>

      {selectedSource && (
        <p className="text-xs text-ink-muted -mt-4">
          Showing only employees dedicated to <strong className="text-ink">{SOURCE_META.find((s) => s.value === selectedSource)?.label}</strong> in
          the auto-assignment rotation.{" "}
          <Link href="/admin/leads" className="font-bold text-primary hover:underline">
            Manage rotation →
          </Link>
        </p>
      )}

      {/* Employees Grid - Clickable Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {visibleEmployees.map((employee) => {
          const totalSales = employee.clients.reduce(
            (s, c) =>
              s +
              c.orders.reduce((os, o) => os + Number(o.amount), 0),
            0
          );
          const convertedLeadsCount = employee.leads.filter((l) => l.status === "CONVERTED").length;
          const deadLeadsCount = employee.leads.filter((l) => l.status === "NOT_INTERESTED").length;
          const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
          const openFollowUps = employee.leads.filter(
            (l) => l.followUpAt && l.status !== "NOT_INTERESTED" && l.status !== "CONVERTED"
          );
          const scheduledFollowUps = openFollowUps.length;
          const overdueFollowUps = openFollowUps.filter((l) => (l.followUpAt as Date) < startOfToday).length;

          const latestSession = employee.sessions[0];
          const isShiftActive = latestSession?.status === "ACTIVE";

          const territoryCity = employee.clients[0]?.territory?.city || "Field Territory";
          const territoryState = employee.clients[0]?.territory?.state || "India";

          return (
            <div
              key={employee.id}
              className="group block rounded-3xl p-6 neo-panel hover:shadow-xl hover:-translate-y-1 transition-all border border-transparent hover:border-purple-200 bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={`/admin/employees/${employee.id}`}
                  className="flex items-center gap-3.5 group/header"
                >
                  <div className="relative">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black text-lg shadow-md shadow-purple-500/25 group-hover/header:scale-105 transition">
                      {employee.name.slice(0, 2).toUpperCase()}
                    </div>
                    {isShiftActive && (
                      <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-ink text-base group-hover/header:text-primary transition flex items-center gap-1.5">
                      {employee.name}
                      <span className="text-primary opacity-0 group-hover/header:opacity-100 transition text-sm">→</span>
                    </h3>
                    <p className="text-xs text-ink-faint mt-0.5">{employee.user.email}</p>
                    <p className="text-xs font-semibold text-primary mt-1">
                      📱 {employee.phoneNumber}
                    </p>
                  </div>
                </Link>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="rounded-full bg-purple-50 border border-purple-200 px-3 py-0.5 text-[10px] font-bold text-purple-800">
                    {territoryCity}, {territoryState}
                  </span>

                  {isShiftActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active Shift
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-ink-faint">
                      Shift Completed
                    </span>
                  )}
                </div>
              </div>

              {/* Auto-Assign Sources: badges + click-to-edit */}
              <div className="mt-4">
                <details className="group/sources">
                  <summary className="flex flex-wrap items-center gap-1.5 cursor-pointer select-none list-none">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mr-0.5">
                      Auto-Assign:
                    </span>
                    {visibleAssignments(employee.id).length === 0 ? (
                      <span className="text-[11px] text-ink-faint italic">No sources — click to assign</span>
                    ) : (
                      visibleAssignments(employee.id).map((a) => {
                        const meta = SOURCE_META.find((s) => s.value === a.source);
                        return (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary"
                          >
                            {meta && <SourceIcon source={meta.value} className="h-3 w-3 shrink-0" />}
                            <span>{meta?.label}</span>
                          </span>
                        );
                      })
                    )}
                    <span className="text-[10px] font-bold text-primary underline decoration-dotted">
                      Edit
                    </span>
                  </summary>

                  <div className="mt-2 rounded-xl border border-line bg-slate-50/70 p-3 grid grid-cols-2 gap-1.5">
                    {SELECTABLE_SOURCES.map((s) => {
                      const existing = (sourcesByEmployee.get(employee.id) || []).find(
                        (a) => a.source === s.value
                      );
                      return (
                        <form
                          key={s.value}
                          action={existing ? removeSourceEmployeeMapping : addSourceEmployeeMapping}
                          className="flex items-center justify-between gap-1.5 rounded-lg bg-white border border-line px-2 py-1.5"
                        >
                          {existing ? (
                            <input type="hidden" name="mappingId" value={existing.id} />
                          ) : (
                            <>
                              <input type="hidden" name="source" value={s.value} />
                              <input type="hidden" name="employeeId" value={employee.id} />
                            </>
                          )}
                          <span className="text-[11px] font-semibold text-ink flex items-center gap-1">
                            <SourceIcon source={s.value} className="h-3.5 w-3.5 shrink-0" />
                            <span>{s.label}</span>
                          </span>
                          <button
                            type="submit"
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition cursor-pointer ${
                              existing
                                ? "text-rose-700 bg-rose-50 hover:bg-rose-100"
                                : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                            }`}
                          >
                            {existing ? "Remove" : "Add"}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </details>
              </div>

              {/* Quick Metrics Strip */}
              <div className={`mt-5 grid grid-cols-2 gap-2.5 ${isCorePlan ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}>
                {!isCorePlan && (
                  <div className="rounded-xl p-3 neo-pressed border border-line text-center bg-slate-50/50">
                    <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Marg Sales</p>
                    <p className="mt-1 text-sm font-black text-emerald-700">
                      {formatINR(totalSales)}
                    </p>
                  </div>
                )}

                <Link
                  href={`/admin/leads?employeeId=${employee.id}`}
                  title={`Open ${employee.name}'s leads`}
                  className="block rounded-xl p-3 neo-pressed border border-line text-center bg-indigo-50/50 hover:bg-gradient-to-r hover:from-sky-100 hover:via-violet-100 hover:to-orange-100 hover:border-violet-200 hover:shadow-md transition"
                >
                  <p className="text-[10px] uppercase font-bold text-indigo-800 tracking-wider">Leads</p>
                  <p className="mt-1 text-sm font-black text-indigo-700">
                    {employee.leads.length} <span className="text-[9px] font-bold text-emerald-700">({convertedLeadsCount}W)</span>
                  </p>
                </Link>

                <Link
                  href={`/admin/follow-ups?employeeId=${employee.id}`}
                  title={`Open ${employee.name}'s follow-ups`}
                  className="block rounded-xl p-3 neo-pressed border border-line text-center bg-sky-50/60 hover:bg-gradient-to-r hover:from-sky-100 hover:via-violet-100 hover:to-orange-100 hover:border-violet-200 hover:shadow-md transition"
                >
                  <p className="text-[10px] uppercase font-bold text-sky-800 tracking-wider">Follow-ups</p>
                  <p className="mt-1 text-sm font-black text-sky-700">
                    {scheduledFollowUps}{" "}
                    {overdueFollowUps > 0 && (
                      <span className="text-[9px] font-bold text-rose-700">({overdueFollowUps} overdue)</span>
                    )}
                  </p>
                </Link>

                <Link
                  href={`/admin/dead-leads?employeeId=${employee.id}`}
                  title={`Open ${employee.name}'s dead leads`}
                  className="block rounded-xl p-3 neo-pressed border border-line text-center bg-rose-50/60 hover:bg-gradient-to-r hover:from-sky-100 hover:via-violet-100 hover:to-orange-100 hover:border-violet-200 hover:shadow-md transition"
                >
                  <p className="text-[10px] uppercase font-bold text-rose-800 tracking-wider">Dead Leads</p>
                  <p className="mt-1 text-sm font-black text-rose-700">{deadLeadsCount}</p>
                </Link>

                <Link
                  href={`/admin/employees/${employee.id}?tab=calls`}
                  className="rounded-xl p-3 neo-pressed border border-line text-center bg-purple-50/60 hover:bg-gradient-to-r hover:from-sky-100 hover:via-violet-100 hover:to-orange-100 hover:border-violet-200 hover:shadow-md transition block"
                  title="View AI Call Summaries & Verbatim Transcripts"
                >
                  <p className="text-[10px] uppercase font-black text-purple-800 tracking-wider flex items-center justify-center gap-1">
                    <span>🤖</span> AI Calls
                  </p>
                  <p className="mt-1 text-sm font-black text-purple-700">{employee.calls.length}</p>
                </Link>
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                <span>{employee.tasks.length} Field Tasks</span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/employees/${employee.id}?tab=calls`}
                    className="inline-flex items-center gap-1.5 font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 hover:scale-[1.03] active:scale-95 border border-purple-200 px-3 py-1.5 rounded-xl transition-all duration-200 text-[11px] shadow-2xs cursor-pointer"
                  >
                    <span>📄</span> View Transcripts & Summaries &rarr;
                  </Link>
                  <Link
                    href={`/admin/employees/${employee.id}`}
                    className="font-bold text-slate-600 hover:text-slate-900 hover:scale-[1.03] active:scale-95 flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all duration-200"
                  >
                    Profile &rarr;
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {!visibleEmployees.length && (
          <div className="col-span-2 rounded-3xl neo-panel p-10 text-center text-sm text-ink-faint">
            {selectedSource
              ? "No employees are dedicated to this source yet. Assign some in Sources & Excel → Auto-Assignment Rules."
              : "No employee profiles registered yet."}
          </div>
        )}
      </div>
    </div>
  );
}
