import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EnterCrmButton } from "@/components/EnterCrmButton";
import { PlanTierSelect } from "@/components/PlanTierSelect";

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  const [companies, totalReps, totalLeads, totalClients] = await Promise.all([
    prisma.company.findMany({
      include: {
        _count: {
          select: {
            users: true,
            employees: true,
            leads: true,
            clients: true,
          },
        },
        settings: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.count(),
    prisma.lead.count(),
    prisma.client.count(),
  ]);

  const coreCount = companies.filter((c) => c.planTier === "CORE_LEAD_SUITE").length;
  const premiumCount = companies.filter((c) => c.planTier === "PREMIUM_ERP").length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-4 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-md shadow-purple-500/20 text-white font-black text-lg">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-white">Pharma CRM</span>
                <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-300 border border-purple-500/30">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">Master B2B Multi-Tenant Platform Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/super-admin/onboard"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-teal-500/20 transition hover:from-emerald-400 hover:to-teal-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Onboard New Business</span>
            </Link>

            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* KPI Overview Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Companies</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 text-sm">
                🏢
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">{companies.length}</p>
            <p className="mt-1 text-xs text-slate-400">
              {coreCount} Core Suite • {premiumCount} Premium ERP
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Global Reps</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400 text-sm">
                👥
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">{totalReps}</p>
            <p className="mt-1 text-xs text-slate-400">Field executives across all tenants</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Leads Ingested</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 text-sm">
                🎯
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">{totalLeads}</p>
            <p className="mt-1 text-xs text-slate-400">PCD, Pharma & 3rd Party franchise queries</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Platform Isolation</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-sm">
                🔒
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-emerald-400">100%</p>
            <p className="mt-1 text-xs text-slate-400">Zero cross-tenant data leak</p>
          </div>
        </section>

        {/* White-Glove Support Callout Banner */}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/30 p-4 text-purple-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 text-base font-bold">
              🛠️
            </span>
            <div>
              <p className="text-xs font-bold text-white">White-Glove Client Assistance & Maintenance Mode</p>
              <p className="text-xs text-purple-300/80">
                Click <strong>Enter CRM as Admin</strong> on any company below to step into their dashboard in support mode. You can configure lead sources, configure reps, verify allotments, and exit back anytime.
              </p>
            </div>
          </div>
          <Link
            href="/super-admin/onboard"
            className="shrink-0 rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-500 transition"
          >
            + Onboard New Client
          </Link>
        </div>

        {/* Companies Directory Table */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-sm">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Client Businesses Directory</h2>
              <p className="text-xs text-slate-400">
                Manage accounts, switch subscription plans, or enter their CRM directly for customer support.
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
              {companies.length} Registered {companies.length === 1 ? "Company" : "Companies"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-900/60 uppercase tracking-wider text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Business Name</th>
                  <th className="px-4 py-3 font-semibold">Plan Tier</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Reps</th>
                  <th className="px-4 py-3 font-semibold text-center">Leads</th>
                  <th className="px-4 py-3 font-semibold text-center">Clients</th>
                  <th className="px-4 py-3 font-semibold text-right">Support Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-900/40 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-white text-sm">{company.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {company.contactEmail} {company.contactPhone ? `• ${company.contactPhone}` : ""}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">slug: {company.slug}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <PlanTierSelect companyId={company.id} initialPlanTier={company.planTier} />
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          company.status === "ACTIVE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {company.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-center font-bold text-white">
                      {company._count.employees}
                    </td>

                    <td className="px-4 py-3.5 text-center font-bold text-white">
                      {company._count.leads}
                    </td>

                    <td className="px-4 py-3.5 text-center font-bold text-white">
                      {company._count.clients}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <EnterCrmButton companyId={company.id} companyName={company.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
