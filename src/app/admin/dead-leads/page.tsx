import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { LeadStatus } from "@/generated/prisma/enums";
import { deleteLead, updateLeadActiveStatus } from "@/lib/admin-actions";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { SourceBadge } from "@/components/SourceBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";

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

interface DeadLeadsPageProps {
  searchParams?: Promise<{
    employeeId?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    search?: string;
  }>;
}

export default async function DeadLeadsPage(props: DeadLeadsPageProps) {
  const resolvedParams = props.searchParams ? await props.searchParams : {};
  const employeeId = resolvedParams.employeeId || "";
  const search = (resolvedParams.search || "").trim().toLowerCase();

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

  const allDeadLeads = await prisma.lead.findMany({
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
  });

  // Apply search filter if present
  let visibleLeads = allDeadLeads;
  if (search) {
    visibleLeads = visibleLeads.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const phone = (l.phoneNumber || "").toLowerCase();
      const details = (l.inquiryDetails || "").toLowerCase();
      const rep = (l.assignedEmployee?.name || "").toLowerCase();
      const city = (l.city || "").toLowerCase();
      return (
        name.includes(search) ||
        phone.includes(search) ||
        details.includes(search) ||
        rep.includes(search) ||
        city.includes(search)
      );
    });
  }

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(resolvedParams.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedDeadLeads = visibleLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const repName = employeeId
    ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } }))?.name ?? null
    : null;

  const buildDeadLeadsUrl = (page: number) => {
    const sp = new URLSearchParams();
    if (resolvedParams.employeeId) sp.set("employeeId", resolvedParams.employeeId);
    if (resolvedParams.search) sp.set("search", resolvedParams.search);
    if (resolvedParams.range) sp.set("range", resolvedParams.range);
    if (resolvedParams.from) sp.set("from", resolvedParams.from);
    if (resolvedParams.to) sp.set("to", resolvedParams.to);
    if (page > 1) sp.set("page", String(page));

    const qs = sp.toString();
    return qs ? `/admin/dead-leads?${qs}` : "/admin/dead-leads";
  };

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Closed-Out Inquiries
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">
              Dead <GradientText>Leads</GradientText> ({totalItems})
            </h1>
          </div>

          {/* Live Search Form */}
          <form method="GET" action="/admin/dead-leads" className="flex items-center gap-2">
            {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
            {resolvedParams.range && <input type="hidden" name="range" value={resolvedParams.range} />}
            <input
              type="text"
              name="search"
              defaultValue={resolvedParams.search || ""}
              placeholder="Search dead lead or rep..."
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-64"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              Filter
            </button>
            {resolvedParams.search && (
              <Link
                href="/admin/dead-leads"
                className="rounded-xl border border-line bg-white px-2.5 py-2 text-xs font-bold text-ink-muted hover:bg-slate-50 transition"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </section>

      {visibleLeads.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            ✅
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Dead Leads</h3>
          <p className="mt-1 text-xs text-ink-muted">
            {search ? "No dead leads matched your search query." : "Every inquiry in the pipeline is still active."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-3 px-4">Prospect</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Representative</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedDeadLeads.map((lead) => {
                  const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
                  const aiReason = buildAiReason(lead);

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <Link href={`/admin/lead-history/${lead.id}`} className="font-bold text-ink hover:text-rose-700">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </Link>
                        <p className="font-mono text-[11px] text-ink-muted">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink">
                        {lead.assignedEmployee?.name || (
                          <span className="text-ink-faint">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-ink-muted">
                        {lead.deadAt
                          ? new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : new Date(lead.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        {callWithSummary ? (
                          <Link
                            href={`/admin/calls?callId=${callWithSummary.id}`}
                            className="block rounded-xl bg-violet-50/80 hover:bg-violet-100 border border-violet-200/80 p-2.5 transition shadow-2xs group"
                          >
                            <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-violet-900 mb-0.5">
                              <span className="inline-flex items-center gap-1">
                                <span>🤖</span>
                                <span>AI Call Summary</span>
                              </span>
                              <span className="text-violet-600 font-semibold text-[10px] group-hover:underline">Open Call ↗</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                              {callWithSummary.aiSummary}
                            </p>
                          </Link>
                        ) : (
                          <p className="text-xs text-ink-muted leading-relaxed line-clamp-2">
                            {aiReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/lead-history/${lead.id}`}
                            className="rounded-xl border border-line bg-white px-2.5 py-1 text-[11px] font-bold text-ink-muted hover:bg-slate-50 transition"
                          >
                            History →
                          </Link>
                          <form action={updateLeadActiveStatus}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="isDead" value="false" />
                            <button
                              type="submit"
                              title="Reactivate lead back into active pipeline"
                              className="rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 active:scale-95 transition cursor-pointer"
                            >
                              ↺ Reactivate
                            </button>
                          </form>
                          <form action={deleteLeadAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <button
                              type="submit"
                              title="Delete lead permanently"
                              className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 active:scale-95 transition cursor-pointer"
                            >
                              🗑
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

          {/* Mobile Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {paginatedDeadLeads.map((lead) => {
              const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
              const aiReason = buildAiReason(lead);

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/admin/lead-history/${lead.id}`} className="group">
                        <h3 className="font-extrabold text-ink text-base group-hover:text-rose-700">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </h3>
                        <p className="font-mono text-xs text-ink-muted mt-0.5">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                      </Link>
                    </div>
                    <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shrink-0">
                      💀 Dead Lead
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                    <span className="text-ink-muted text-xs">
                      Rep: <strong className="text-ink">{lead.assignedEmployee?.name || "Unassigned"}</strong>
                    </span>
                    {lead.deadAt && (
                      <span className="text-ink-faint text-[11px]">
                        Closed: {new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {callWithSummary ? (
                    <Link
                      href={`/admin/calls?callId=${callWithSummary.id}`}
                      className="block rounded-xl bg-violet-50/80 hover:bg-violet-100 border border-violet-200/80 p-3 transition shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-violet-900 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <span>🤖</span>
                          <span>AI Call Summary</span>
                        </span>
                        <span className="text-violet-600 font-semibold text-[10px]">Open Call ↗</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                        {callWithSummary.aiSummary}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-xs text-ink-muted leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-line-soft">
                      {aiReason}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <Link
                      href={`/admin/lead-history/${lead.id}`}
                      className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-muted hover:bg-slate-50 transition"
                    >
                      Full History →
                    </Link>

                    <div className="flex items-center gap-2">
                      <form action={updateLeadActiveStatus}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="isDead" value="false" />
                        <button
                          type="submit"
                          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 active:bg-emerald-100 transition shadow-2xs cursor-pointer"
                        >
                          ↺ Reactivate
                        </button>
                      </form>
                      <form action={deleteLeadAction}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 active:bg-rose-100 transition shadow-2xs cursor-pointer"
                        >
                          🗑
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={LEADS_PER_PAGE}
            itemName="dead leads"
            buildHref={buildDeadLeadsUrl}
          />
        </div>
      )}
    </div>
  );
}
