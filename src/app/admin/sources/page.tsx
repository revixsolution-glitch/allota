import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LeadSource } from "@/generated/prisma/enums";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ExcelUploader } from "./ExcelUploader";

import { parseDashboardDateFilter } from "@/lib/date-filters";

interface SourcesHubPageProps {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function SourcesHubPage(props: SourcesHubPageProps) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

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

  // Query pure database metrics
  const [employees, sourceGroups, divisionGroups, excelBatches, unassignedExcelBatches, recentUploads] =
    await Promise.all([
      prisma.employee.findMany({
        where: companyScope,
        select: {
          id: true,
          name: true,
          _count: { select: { leads: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.lead.groupBy({
        by: ["source"],
        where: { ...companyScope, ...leadDateFilter },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["division"],
        where: { ...companyScope, ...leadDateFilter },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["sourceTag", "division"],
        where: { source: LeadSource.EXCEL_IMPORT, ...companyScope, ...leadDateFilter },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["sourceTag"],
        where: { source: LeadSource.EXCEL_IMPORT, assignedEmployeeId: null, ...companyScope, ...leadDateFilter },
        _count: { _all: true },
      }),
      prisma.lead.findMany({
        where: { source: LeadSource.EXCEL_IMPORT, ...companyScope, ...leadDateFilter },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          sourceTag: true,
          division: true,
          city: true,
          state: true,
          status: true,
          createdAt: true,
          assignedEmployee: { select: { name: true } },
        },
      }),
    ]);

  const sourceMap = new Map(sourceGroups.map((s) => [s.source, s._count._all]));
  const totalLeads = sourceGroups.reduce((acc, curr) => acc + curr._count._all, 0);

  const divisionMap = new Map(divisionGroups.map((d) => [d.division || "PCD_FRANCHISE", d._count._all]));
  const pcdCount = divisionMap.get("PCD_FRANCHISE") || 0;
  const tpCount = divisionMap.get("THIRD_PARTY") || 0;

  const unassignedBatchMap = new Map(
    unassignedExcelBatches.map((b) => [b.sourceTag || "Untagged Batch", b._count._all])
  );

  // Group Excel batches by sourceTag
  const batchSummaryMap = new Map<
    string,
    { tag: string; division: string; total: number; unassigned: number }
  >();

  for (const b of excelBatches) {
    const tag = b.sourceTag || "General Import";
    const existing = batchSummaryMap.get(tag);
    if (existing) {
      existing.total += b._count._all;
    } else {
      batchSummaryMap.set(tag, {
        tag,
        division: b.division || "PCD_FRANCHISE",
        total: b._count._all,
        unassigned: unassignedBatchMap.get(tag) || 0,
      });
    }
  }

  const batchList = Array.from(batchSummaryMap.values());
  const totalExcelLeads = sourceMap.get(LeadSource.EXCEL_IMPORT) || 0;

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: e.name,
    leadCount: e._count.leads,
  }));

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-emerald-500">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Zero-Cost Lead Acquisition Hub
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Plan: <strong className="text-emerald-700">Core Telecaller Suite</strong>
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Sources & Bulk Ingestion Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Connect external advertising platforms (Meta, IndiaMART, WhatsApp) and import bulk chemist directories 
              or expo attendee spreadsheets (5,000+ contacts) with zero Marg ERP API overhead.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3.5 text-center shrink-0">
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Total Ingested
              </p>
              <p className="mt-1 text-2xl font-extrabold text-ink">{totalLeads}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                PCD Inquiries
              </p>
              <p className="mt-1 text-2xl font-extrabold text-blue-700">{pcdCount}</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Third-Party Mfg
              </p>
              <p className="mt-1 text-2xl font-extrabold text-purple-700">{tpCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Multi-Channel Connectors & Real-Time Sync Status */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Connected Marketing Channels</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Live APIs feeding inquiries into the unified lead pool with instant deduplication
            </p>
          </div>
          <Link
            href="/admin/leads"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>View All Leads</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Meta Lead Ads */}
          <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-blue-600 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xl">🌐</span>
              <span className="rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-[10px] font-bold">
                API Live
              </span>
            </div>
            <h3 className="font-bold text-ink text-sm mt-3">Meta Ads Webhook</h3>
            <p className="text-xs text-ink-faint mt-0.5">Facebook & Instagram Lead Forms</p>
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink-muted">Inquiries</span>
              <span className="text-base font-extrabold text-blue-700">
                {sourceMap.get(LeadSource.META) || 0}
              </span>
            </div>
          </div>

          {/* IndiaMART */}
          <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xl">🛒</span>
              <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold">
                Push API Active
              </span>
            </div>
            <h3 className="font-bold text-ink text-sm mt-3">IndiaMART BuyLead</h3>
            <p className="text-xs text-ink-faint mt-0.5">Buyer Inquiries & Monopoly Requests</p>
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink-muted">Inquiries</span>
              <span className="text-base font-extrabold text-amber-700">
                {sourceMap.get(LeadSource.INDIAMART) || 0}
              </span>
            </div>
          </div>

          {/* WhatsApp Cloud API */}
          <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-500 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xl">💬</span>
              <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                Auto-Reply Live
              </span>
            </div>
            <h3 className="font-bold text-ink text-sm mt-3">WhatsApp Cloud API</h3>
            <p className="text-xs text-ink-faint mt-0.5">Direct Prospect Inbound & Chatbot</p>
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink-muted">Inquiries</span>
              <span className="text-base font-extrabold text-emerald-700">
                {sourceMap.get(LeadSource.WHATSAPP) || 0}
              </span>
            </div>
          </div>

          {/* Bulk Excel / CSV Ingestions */}
          <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-teal-500 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xl">📊</span>
              <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-[10px] font-bold">
                {batchList.length} Batches
              </span>
            </div>
            <h3 className="font-bold text-ink text-sm mt-3">Bulk Excel / CSV</h3>
            <p className="text-xs text-ink-faint mt-0.5">Expo lists, Chemist databases</p>
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink-muted">Inquiries</span>
              <span className="text-base font-extrabold text-teal-700">
                {totalExcelLeads}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Interactive Drag & Drop Bulk Uploader */}
      <section>
        <ExcelUploader employees={employeeOptions} />
      </section>

      {/* 3. Ingestion Batches & History */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Excel Import Batches</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Directly allot any batch to reps from the Leads Allotment Desk
            </p>
          </div>
        </div>

        {batchList.length === 0 ? (
          <div className="rounded-2xl p-8 neo-panel text-center bg-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 text-xl">
              📂
            </div>
            <p className="mt-3 text-sm font-bold text-ink">No Excel Batches Imported Yet</p>
            <p className="mt-1 text-xs text-ink-muted">
              Upload your chemist contact list or expo attendee sheets using the uploader above.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3.5">Batch Tag / Source Name</th>
                    <th className="px-4 py-3.5">Category Division</th>
                    <th className="px-4 py-3.5">Total Ingested</th>
                    <th className="px-4 py-3.5">Unassigned Queue</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {batchList.map((batch) => (
                    <tr key={batch.tag} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-4 font-bold text-ink">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🏷️</span>
                          <span>{batch.tag}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            batch.division === "THIRD_PARTY"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {batch.division === "THIRD_PARTY"
                            ? "Third-Party Mfg"
                            : "PCD Franchise"}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-extrabold text-ink">
                        {batch.total} leads
                      </td>
                      <td className="px-4 py-4">
                        {batch.unassigned > 0 ? (
                          <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            {batch.unassigned} awaiting rep
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            All Allotted ✓
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] text-ink-muted font-medium">
                          Active in CRM
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/leads?division=${batch.division}&source=EXCEL_IMPORT`}
                          className="inline-flex items-center gap-1 rounded-xl bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition shadow-2xs"
                        >
                          <span>Allot In Leads Desk</span>
                          <span>&rarr;</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 4. Recent Ingested Leads Sample */}
      {recentUploads.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Recently Ingested Contacts</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Last 10 records parsed and added to the telecalling queue
            </p>
          </div>

          <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-3">Lead Name</th>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Assigned Rep</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Added At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentUploads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5 font-bold text-ink">{lead.name}</td>
                      <td className="px-4 py-3.5 font-mono text-ink-muted">{lead.phoneNumber}</td>
                      <td className="px-4 py-3.5 text-ink-muted">
                        {lead.city ? `${lead.city}, ${lead.state || ""}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-ink-faint">{lead.sourceTag || "Excel"}</td>
                      <td className="px-4 py-3.5">
                        {lead.assignedEmployee ? (
                          <span className="font-semibold text-ink">{lead.assignedEmployee.name}</span>
                        ) : (
                          <span className="text-amber-600 font-bold">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-ink-faint">
                        {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
