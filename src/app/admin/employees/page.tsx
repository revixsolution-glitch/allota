import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { AddEmployeeModal } from "@/components/AddEmployeeModal";

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

  const employees = await prisma.employee.findMany({
    where: activeCompanyId
      ? {
          OR: [
            { companyId: activeCompanyId },
            { companyId: null },
            { name: { contains: "Savi" } },
          ],
        }
      : {},
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
  });

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
              Representative Team Management
            </h1>
            <p className="mt-1 text-sm text-ink-muted max-w-2xl">
              Manage your company's field sales force, provision new employee logins, and inspect daily activity logs, leads handled, and calls.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <AddEmployeeModal />

            <div className="rounded-2xl px-5 py-3 neo-pressed border border-line text-center">
              <p className="text-3xl font-black text-purple-600">{employees.length}</p>
              <p className="text-xs font-semibold text-ink-faint">Active Representatives</p>
            </div>
          </div>
        </div>
      </section>

      {/* Employees Grid - Clickable Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {employees.map((employee) => {
          const totalSales = employee.clients.reduce(
            (s, c) =>
              s +
              c.orders.reduce((os, o) => os + Number(o.amount), 0),
            0
          );
          const convertedLeadsCount = employee.leads.filter((l) => l.status === "CONVERTED").length;
          const deadLeadsCount = employee.leads.filter((l) => l.status === "NOT_INTERESTED").length;
          const repeatClientsCount = employee.clients.filter((c) => c.isRepeatCustomer).length;
          const newClientsCount = employee.clients.length - repeatClientsCount;

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

              {/* Quick Metrics Strip */}
              <div className="mt-5 grid grid-cols-4 gap-2.5">
                <div className="rounded-xl p-3 neo-pressed border border-line text-center bg-slate-50/50">
                  <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Marg Sales</p>
                  <p className="mt-1 text-sm font-black text-emerald-700">
                    {formatINR(totalSales)}
                  </p>
                </div>

                <div className="rounded-xl p-3 neo-pressed border border-line text-center bg-slate-50/50">
                  <p className="text-[10px] uppercase font-bold text-teal-800 tracking-wider">Clients</p>
                  <p className="mt-1 text-sm font-black text-teal-700">
                    {employee.clients.length} <span className="text-[9px] font-normal text-ink-faint">({newClientsCount}N/{repeatClientsCount}R)</span>
                  </p>
                </div>

                <div className="rounded-xl p-3 neo-pressed border border-line text-center bg-slate-50/50">
                  <p className="text-[10px] uppercase font-bold text-indigo-800 tracking-wider">Leads</p>
                  <p className="mt-1 text-sm font-black text-indigo-700">
                    {employee.leads.length} <span className="text-[9px] font-normal text-emerald-700 font-bold">({convertedLeadsCount}W)</span>
                  </p>
                </div>

                <Link
                  href={`/admin/employees/${employee.id}?tab=calls`}
                  className="rounded-xl p-3 neo-pressed border border-line text-center bg-purple-50/60 hover:bg-purple-100/70 hover:border-purple-300 hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 block group/aicall cursor-pointer"
                  title="View AI Call Summaries & Verbatim Transcripts"
                >
                  <p className="text-[10px] uppercase font-black text-purple-800 tracking-wider flex items-center justify-center gap-1">
                    <span>🤖</span> AI Calls
                  </p>
                  <p className="mt-1 text-sm font-black text-purple-700 group-hover/aicall:text-purple-900">
                    {employee.calls.length}
                  </p>
                </Link>
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                <span>
                  {deadLeadsCount > 0 ? (
                    <span className="text-rose-700 font-semibold">{deadLeadsCount} Dead Leads marked</span>
                  ) : (
                    <span>{employee.tasks.length} Field Tasks</span>
                  )}
                </span>
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

        {!employees.length && (
          <div className="col-span-2 rounded-3xl neo-panel p-10 text-center text-sm text-ink-faint">
            No employee profiles registered yet.
          </div>
        )}
      </div>
    </div>
  );
}
