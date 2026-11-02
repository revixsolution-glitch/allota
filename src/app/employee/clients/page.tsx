import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseDashboardDateFilter } from "@/lib/date-filters";
import { GradientText } from "@/components/GradientText";

export default async function EmployeeClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await getSession();
  const employeeId = session?.employeeId;

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const dateFilter = parseDashboardDateFilter(
    params.range,
    params.from,
    params.to
  );

  const clientDateFilter =
    dateFilter.start && dateFilter.end
      ? { createdAt: { gte: dateFilter.start, lte: dateFilter.end } }
      : dateFilter.start
      ? { createdAt: { gte: dateFilter.start } }
      : {};

  const [clients, employee] = await Promise.all([
    prisma.client.findMany({
      where: {
        assignedEmployeeId: employeeId,
        ...clientDateFilter,
      },
      include: {
        territory: true,
        _count: { select: { orders: true, creditRecords: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-indigo-500 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Franchise Accounts Master
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">
              My Active <GradientText>Clients</GradientText> ({clients.length})
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Representative: <strong className="text-ink">{employee?.name}</strong> • Retailers, PCD Franchisees, and Hospitals under your coverage
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/employee"
              className="rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-ink-muted hover:text-ink transition"
            >
              &larr; Back to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Clients Table */}
      {clients.length === 0 ? (
        <div className="rounded-3xl p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            🏢
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Clients Assigned Yet</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Franchise accounts assigned to you by Admin will appear here once onboarded.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          <div className="overflow-x-auto crm-table-container w-full">
            <table className="w-full text-left text-xs min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3.5 w-[300px] min-w-[280px] whitespace-nowrap">Client & Business Name</th>
                  <th className="px-4 py-3.5 w-[180px] min-w-[160px] whitespace-nowrap">Contact Number</th>
                  <th className="px-4 py-3.5 w-[160px] min-w-[150px] whitespace-nowrap">Territory</th>
                  <th className="px-4 py-3.5 w-[160px] min-w-[150px] whitespace-nowrap">Business Type</th>
                  <th className="px-4 py-3.5 w-[140px] min-w-[130px] whitespace-nowrap">Status</th>
                  <th className="px-5 py-3.5 w-[160px] min-w-[150px] text-right whitespace-nowrap">Orders History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clients.map((client) => {
                  const cleanPhone = (client.phoneNumber || "").replace(/\D/g, "");

                  return (
                    <tr key={client.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-4">
                        <div className="font-extrabold text-ink text-sm">
                          {client.name}
                        </div>
                        {client.companyDetails && (
                          <p className="text-[11px] text-ink-faint mt-0.5 max-w-sm truncate">
                            {client.companyDetails}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 font-mono text-ink-muted">
                        <div className="flex items-center gap-2">
                          <span>{client.phoneNumber || "—"}</span>
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Call Client"
                                className="h-6 w-6 rounded-md bg-blue-50 text-blue-700 inline-flex items-center justify-center hover:bg-blue-100"
                              >
                                📞
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp Client"
                                className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-100"
                              >
                                💬
                              </a>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {client.territory ? (
                          <span className="font-semibold text-ink">
                            📍 {client.territory.city}, {client.territory.state}
                          </span>
                        ) : (
                          <span className="text-ink-faint">Unassigned Area</span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            client.businessType === "THIRD_PARTY"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {client.businessType === "THIRD_PARTY"
                            ? "🏭 Third-Party Mfg"
                            : "🏢 PCD Franchise"}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                          {client.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right font-extrabold text-ink">
                        {client._count.orders} orders
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
