import Link from "next/link";
import { getSession, getActiveCompanyId, scopeToCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { updateLeadActiveStatus } from "@/lib/admin-actions";
import { SourceBadge } from "@/components/SourceBadge";
import { GradientText } from "@/components/GradientText";
import { parseDashboardDateFilter } from "@/lib/date-filters";
import { PaginationBar } from "@/components/PaginationBar";
import { ProtectedData } from "@/components/ProtectedData";

export const dynamic = "force-dynamic";

interface EmployeeDeadLeadsPageProps {
  searchParams?: Promise<{
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
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
    return truncate(latestCallWithSummary.aiSummary, 200);
  }
  if (lead.inquiryDetails) {
    return truncate(lead.inquiryDetails, 200);
  }
  return "No notes or call recordings on record.";
}

export default async function EmployeeDeadLeadsPage(props: EmployeeDeadLeadsPageProps) {
  const session = await getSession();
  const employeeId = session?.employeeId;
  const activeCompanyId = getActiveCompanyId(session);

  if (!employeeId) {
    return (
      <div className="p-8 text-center text-sm text-ink-muted">
        No employee profile linked to this session. Please log in with your field representative credentials.
      </div>
    );
  }

  const params = props.searchParams ? await props.searchParams : {};
  const search = (params?.search || "").trim().toLowerCase();

  const dateFilter = parseDashboardDateFilter(
    params?.range,
    params?.from,
    params?.to
  );

  const baseCompanyFilter = scopeToCompany(activeCompanyId);

  const dateWhere = dateFilter.start && dateFilter.end
    ? { updatedAt: { gte: dateFilter.start, lte: dateFilter.end } }
    : dateFilter.start
    ? { updatedAt: { gte: dateFilter.start } }
    : {};

  // Strict Tenant & Representative Isolation:
  // ONLY fetch leads where assignedEmployeeId === employeeId AND companyId === activeCompanyId
  const [employee, allDeadLeads] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.lead.findMany({
      where: {
        status: LeadStatus.NOT_INTERESTED,
        assignedEmployeeId: employeeId,
        ...baseCompanyFilter,
        ...dateWhere,
      },
      include: {
        calls: {
          orderBy: { occurredAt: "desc" },
          select: { id: true, occurredAt: true, durationSec: true, missed: true, aiSummary: true },
        },
        remarks: {
          include: { employee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ deadAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  // Apply search query
  let visibleLeads = allDeadLeads;
  if (search) {
    visibleLeads = visibleLeads.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const phone = (l.phoneNumber || "").toLowerCase();
      const details = (l.inquiryDetails || "").toLowerCase();
      const city = (l.city || "").toLowerCase();
      return (
        name.includes(search) ||
        phone.includes(search) ||
        details.includes(search) ||
        city.includes(search)
      );
    });
  }

  const LEADS_PER_PAGE = 15;
  const rawPage = parseInt(params?.page || "1", 10);
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const totalItems = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LEADS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const paginatedDeadLeads = visibleLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  const buildEmployeeDeadLeadsUrl = (page: number) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.range) sp.set("range", params.range);
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (page > 1) sp.set("page", String(page));

    const qs = sp.toString();
    return qs ? `/employee/dead-leads?${qs}` : "/employee/dead-leads";
  };

  return (
    <div className="space-y-6">
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
              My Dead <GradientText>Leads</GradientText> ({totalItems})
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Representative: <strong className="text-ink">{employee?.name}</strong> • Only leads closed by you are listed here.
            </p>
          </div>

          {/* Search Box */}
          <form method="GET" action="/employee/dead-leads" className="flex items-center gap-2">
            {params?.range && <input type="hidden" name="range" value={params.range} />}
            <input
              type="text"
              name="search"
              defaultValue={params?.search || ""}
              placeholder="Search by name, phone or city..."
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-64"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              Filter
            </button>
            {params?.search && (
              <Link
                href="/employee/dead-leads"
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
            {search ? "No closed leads matched your search query." : "All your allotted leads are currently active in your pipeline."}
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
                  <th className="py-3 px-4">City / State</th>
                  <th className="py-3 px-4">Closed Date</th>
                  <th className="py-3 px-4">Reason / Call Summary</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginatedDeadLeads.map((lead) => {
                  const callWithSummary = lead.calls.find((c) => c.aiSummary && c.aiSummary.trim().length > 0);
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const aiReason = buildAiReason(lead);

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-ink">
                          <ProtectedData text={lead.name || "Unnamed Prospect"} />
                        </div>
                        <p className="font-mono text-[11px] text-ink-muted">
                          <ProtectedData text={lead.phoneNumber || "No phone"} />
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                      </td>
                      <td className="py-3 px-4 text-ink-muted">
                        {lead.city || lead.state ? `${lead.city || ""} ${lead.state || ""}`.trim() : "—"}
                      </td>
                      <td className="py-3 px-4 text-ink-muted">
                        {lead.deadAt
                          ? new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : new Date(lead.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        {callWithSummary ? (
                          <div className="rounded-xl bg-violet-50/80 border border-violet-200/80 p-2.5 shadow-2xs">
                            <span className="text-[10px] font-bold text-violet-900 block mb-0.5">
                              🤖 AI Call Summary:
                            </span>
                            <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                              {callWithSummary.aiSummary}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-ink-muted leading-relaxed line-clamp-2">
                            {aiReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Call prospect"
                                className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition"
                              >
                                📞 Call
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Open WhatsApp chat"
                                className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition"
                              >
                                💬 WhatsApp
                              </a>
                            </>
                          )}
                          <form action={updateLeadActiveStatus}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="isDead" value="false" />
                            <button
                              type="submit"
                              title="Reactivate lead back into active pipeline"
                              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-95 transition cursor-pointer"
                            >
                              ↺ Reactivate
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
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const aiReason = buildAiReason(lead);

              return (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-ink text-base">
                        <ProtectedData text={lead.name || "Unnamed Prospect"} />
                      </h3>
                      <p className="font-mono text-xs text-ink-muted mt-0.5">
                        <ProtectedData text={lead.phoneNumber || "No phone"} />
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shrink-0">
                      💀 Dead Lead
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SourceBadge source={lead.source} sourceTag={lead.sourceTag} />
                    {lead.deadAt && (
                      <span className="text-ink-faint text-[11px]">
                        Closed: {new Date(lead.deadAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {callWithSummary ? (
                    <div className="rounded-xl bg-violet-50/80 border border-violet-200/80 p-3 shadow-2xs">
                      <span className="text-[11px] font-bold text-violet-900 block mb-1">
                        🤖 AI Call Summary:
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                        {callWithSummary.aiSummary}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-line-soft">
                      {aiReason}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <div className="flex items-center gap-2">
                      {cleanPhone && (
                        <>
                          <a
                            href={`tel:${cleanPhone}`}
                            className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700"
                          >
                            📞 Call
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700"
                          >
                            💬 WhatsApp
                          </a>
                        </>
                      )}
                    </div>

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
            buildHref={buildEmployeeDeadLeadsUrl}
          />
        </div>
      )}
    </div>
  );
}
