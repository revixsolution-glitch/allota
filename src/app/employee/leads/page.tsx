import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import { updateEmployeeLeadStatus, logEmployeeCall } from "@/lib/admin-actions";

export default async function EmployeeLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ division?: string; search?: string }>;
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

  const params = await searchParams;
  const selectedDivision = params?.division || "ALL";
  const search = (params?.search || "").trim().toLowerCase();

  const where: Record<string, any> = {
    assignedEmployeeId: employeeId,
  };

  if (selectedDivision === "PCD_FRANCHISE" || selectedDivision === "THIRD_PARTY") {
    where.division = selectedDivision;
  }

  const [leads, employee, divisionCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        _count: { select: { calls: true } },
        reassignmentLogs: {
          take: 1,
          orderBy: { reassignedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, phoneNumber: true },
    }),
    prisma.lead.groupBy({
      by: ["division"],
      where: { assignedEmployeeId: employeeId },
      _count: { _all: true },
    }),
  ]);

  const pcdCount =
    divisionCounts.find((d) => d.division === "PCD_FRANCHISE")?._count._all || 0;
  const tpCount =
    divisionCounts.find((d) => d.division === "THIRD_PARTY")?._count._all || 0;
  const totalLeads = pcdCount + tpCount;

  // Filter leads if search query present
  const filteredLeads = search
    ? leads.filter((l) => {
        const name = (l.name || "").toLowerCase();
        const phone = (l.phoneNumber || "").toLowerCase();
        const city = (l.city || "").toLowerCase();
        const state = (l.state || "").toLowerCase();
        const details = (l.inquiryDetails || "").toLowerCase();
        return (
          name.includes(search) ||
          phone.includes(search) ||
          city.includes(search) ||
          state.includes(search) ||
          details.includes(search)
        );
      })
    : leads;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <section className="rounded-3xl p-6 neo-panel border-t-2 border-t-primary/70 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Assigned Inquiries Desk
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">
              My Allotted Leads ({totalLeads})
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Representative: <strong className="text-ink">{employee?.name}</strong> • Phone: {employee?.phoneNumber}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/employee"
              className="rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-ink-muted hover:text-ink transition"
            >
              &larr; Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Division Filter Chips & Search Bar */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/employee/leads"
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
                selectedDivision === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-canvas text-ink-muted hover:text-ink border border-line"
              }`}
            >
              All Inquiries ({totalLeads})
            </Link>
            <Link
              href="/employee/leads?division=PCD_FRANCHISE"
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                selectedDivision === "PCD_FRANCHISE"
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200"
              }`}
            >
              <span>🏢</span>
              <span>PCD Franchise ({pcdCount})</span>
            </Link>
            <Link
              href="/employee/leads?division=THIRD_PARTY"
              className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                selectedDivision === "THIRD_PARTY"
                  ? "bg-purple-700 text-white shadow-xs"
                  : "bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200"
              }`}
            >
              <span>🏭</span>
              <span>Third-Party ({tpCount})</span>
            </Link>
          </div>

          {/* Search Bar */}
          <form className="flex items-center gap-2 w-full sm:w-auto">
            {selectedDivision !== "ALL" && (
              <input type="hidden" name="division" value={selectedDivision} />
            )}
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by prospect, phone, city..."
              className="h-10 flex-1 sm:w-64 rounded-xl border border-line bg-canvas px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-3.5 text-xs font-bold text-white hover:bg-primary-strong transition shrink-0 cursor-pointer"
            >
              Search
            </button>
            {search && (
              <Link
                href={
                  selectedDivision !== "ALL"
                    ? `/employee/leads?division=${selectedDivision}`
                    : "/employee/leads"
                }
                className="text-xs font-bold text-ink-faint hover:text-ink shrink-0"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </section>

      {/* Leads Container */}
      {filteredLeads.length === 0 ? (
        <div className="rounded-3xl p-10 sm:p-12 text-center neo-panel bg-white border border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            📋
          </div>
          <h3 className="mt-3 text-sm font-bold text-ink">No Leads Found</h3>
          <p className="mt-1 text-xs text-ink-muted">
            {search
              ? "No inquiries matched your search query."
              : "Zero leads are currently allotted to your queue. New batches assigned by Admin will show here immediately."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl neo-panel bg-white border border-line overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3.5">Prospect & Contact</th>
                  <th className="px-4 py-3.5">Division Category</th>
                  <th className="px-4 py-3.5">Channel / Batch</th>
                  <th className="px-4 py-3.5">Location</th>
                  <th className="px-4 py-3.5">Inquiry Details</th>
                  <th className="px-4 py-3.5">Update Stage</th>
                  <th className="px-5 py-3.5 text-right">Telephony Touch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredLeads.map((lead) => {
                  const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
                  const isThirdParty = lead.division === "THIRD_PARTY";

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                      {/* Prospect & Contact */}
                      <td className="px-5 py-4">
                        <div className="font-extrabold text-ink text-sm">
                          {lead.name || "Anonymous Prospect"}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-muted">
                          <span>{lead.phoneNumber || "No Phone"}</span>
                          {cleanPhone && (
                            <>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Click to Call"
                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                              >
                                📞
                              </a>
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open WhatsApp Chat"
                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                              >
                                💬
                              </a>
                            </>
                          )}
                        </div>
                        {lead.reassignmentLogs && lead.reassignmentLogs.length > 0 && (
                          <p className="text-[10px] text-teal-700 font-bold mt-1">
                            ⚡ Allotted by Admin ({lead.reassignmentLogs[0].reason || "Direct Allotment"})
                          </p>
                        )}
                      </td>

                      {/* Division Category */}
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            isThirdParty
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {isThirdParty ? "🏭 Third-Party Mfg" : "🏢 PCD Franchise"}
                        </span>
                      </td>

                      {/* Channel / Batch */}
                      <td className="px-4 py-4">
                        <span className="font-semibold text-ink text-xs">
                          {lead.source}
                        </span>
                        {lead.sourceTag && (
                          <p className="text-[10px] text-ink-faint mt-0.5 truncate max-w-[140px]" title={lead.sourceTag}>
                            🏷️ {lead.sourceTag}
                          </p>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-4 py-4 text-ink-muted">
                        {lead.city ? `${lead.city}, ${lead.state || ""}` : "—"}
                      </td>

                      {/* Inquiry Details */}
                      <td className="px-4 py-4 max-w-xs">
                        <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">
                          {lead.inquiryDetails || "No details provided"}
                        </p>
                      </td>

                      {/* Update Stage Form */}
                      <td className="px-4 py-4">
                        <form action={updateEmployeeLeadStatus} className="flex items-center gap-1.5">
                          <input type="hidden" name="leadId" value={lead.id} />
                          <select
                            name="status"
                            defaultValue={lead.status}
                            className="h-8 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value={LeadStatus.ASSIGNED}>Assigned (New)</option>
                            <option value={LeadStatus.CONTACTED}>Contacted</option>
                            <option value={LeadStatus.INTERESTED}>Interested</option>
                            <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                            <option value={LeadStatus.CONVERTED}>Converted ✓</option>
                          </select>
                          <button
                            type="submit"
                            className="h-8 rounded-lg bg-slate-100 hover:bg-primary hover:text-white text-ink px-2 text-[11px] font-bold transition cursor-pointer"
                          >
                            Save
                          </button>
                        </form>
                      </td>

                      {/* Telephony Touch / Quick Log Call */}
                      <td className="px-5 py-4 text-right">
                        <details className="inline-block text-left group">
                          <summary className="inline-flex items-center gap-1 rounded-xl bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition cursor-pointer select-none">
                            <span>📞 Log Call</span>
                            <span className="text-[10px] text-teal-600">
                              ({lead._count.calls})
                            </span>
                          </summary>

                          <div className="absolute right-8 mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl border border-line z-20">
                            <h4 className="text-xs font-extrabold text-ink mb-2">
                              Record Call with {lead.name}
                            </h4>
                            <form action={logEmployeeCall} className="space-y-2.5">
                              <input type="hidden" name="leadId" value={lead.id} />

                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                  Call Result *
                                </label>
                                <select
                                  name="callStatus"
                                  defaultValue="ANSWERED"
                                  className="w-full h-8 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink focus:outline-none"
                                >
                                  <option value="ANSWERED">🟢 Picked / Answered</option>
                                  <option value="NOT_ANSWERED">🔴 Not Answered / Missed</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                  Call Notes
                                </label>
                                <textarea
                                  name="notes"
                                  rows={2}
                                  placeholder="Discussion details, monopoly terms, or missed reason..."
                                  className="w-full rounded-xl border border-line p-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-teal-500"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                    Duration (sec)
                                  </label>
                                  <input
                                    type="number"
                                    name="durationSec"
                                    defaultValue={180}
                                    min={0}
                                    className="w-full h-8 rounded-lg border border-line px-2 text-xs text-ink focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                                    Set Outcome
                                  </label>
                                  <select
                                    name="outcome"
                                    defaultValue={LeadStatus.INTERESTED}
                                    className="w-full h-8 rounded-lg border border-line px-1 text-xs text-ink focus:outline-none"
                                  >
                                    <option value={LeadStatus.CONTACTED}>Contacted</option>
                                    <option value={LeadStatus.INTERESTED}>Interested</option>
                                    <option value={LeadStatus.CONVERTED}>Converted</option>
                                    <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                                  </select>
                                </div>
                              </div>

                              <button
                                type="submit"
                                className="w-full h-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                              >
                                Save Call Touchpoint
                              </button>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (lg:hidden) */}
          <div className="lg:hidden divide-y divide-line">
            {filteredLeads.map((lead) => {
              const cleanPhone = (lead.phoneNumber || "").replace(/\D/g, "");
              const isThirdParty = lead.division === "THIRD_PARTY";

              return (
                <div key={lead.id} className="p-4 space-y-3.5">
                  {/* Prospect Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-ink text-base">
                        {lead.name || "Anonymous Prospect"}
                      </h3>
                      <p className="font-mono text-ink-muted text-xs mt-0.5">
                        {lead.phoneNumber || "No phone"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                        isThirdParty
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {isThirdParty ? "Third-Party" : "PCD Franchise"}
                    </span>
                  </div>

                  {/* Badges strip: Source & Location */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink">
                      {lead.source}
                    </span>
                    {lead.sourceTag && (
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] text-ink-muted">
                        🏷️ {lead.sourceTag}
                      </span>
                    )}
                    {lead.city && (
                      <span className="text-ink-muted text-xs">
                        📍 {lead.city}{lead.state ? `, ${lead.state}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Inquiry notes */}
                  {lead.inquiryDetails && (
                    <p className="text-xs text-ink-muted bg-slate-50 p-2.5 rounded-xl border border-line-soft leading-relaxed">
                      {lead.inquiryDetails}
                    </p>
                  )}

                  {/* Direct 1-tap dialers */}
                  {cleanPhone && (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 py-2 text-xs font-bold text-blue-700 active:bg-blue-200 transition"
                      >
                        <span>📞</span>
                        <span>Call Direct</span>
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 py-2 text-xs font-bold text-emerald-700 active:bg-emerald-200 transition"
                      >
                        <span>💬</span>
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  )}

                  {/* Inline Stage update form */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-soft">
                    <form action={updateEmployeeLeadStatus} className="flex items-center gap-1.5 flex-1">
                      <input type="hidden" name="leadId" value={lead.id} />
                      <select
                        name="status"
                        defaultValue={lead.status}
                        className="h-9 flex-1 rounded-xl border border-line bg-white px-2 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value={LeadStatus.ASSIGNED}>Assigned</option>
                        <option value={LeadStatus.CONTACTED}>Contacted</option>
                        <option value={LeadStatus.INTERESTED}>Interested</option>
                        <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                        <option value={LeadStatus.CONVERTED}>Converted ✓</option>
                      </select>
                      <button
                        type="submit"
                        className="h-9 rounded-xl bg-slate-100 hover:bg-primary hover:text-white text-ink px-3 text-xs font-bold transition cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                    </form>
                  </div>

                  {/* Inline Log Call accordian */}
                  <details className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 group">
                    <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-teal-900 select-none list-none">
                      <div className="flex items-center gap-1.5">
                        <span>📞 Record Call Touchpoint</span>
                        <span className="text-[10px] text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full">
                          {lead._count.calls} logged
                        </span>
                      </div>
                      <span className="text-teal-700 font-bold transition-transform group-open:rotate-180">▾</span>
                    </summary>

                    <form action={logEmployeeCall} className="mt-3 space-y-2.5 pt-2 border-t border-teal-200/60">
                      <input type="hidden" name="leadId" value={lead.id} />

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-900 mb-1">
                          Call Result *
                        </label>
                        <select
                          name="callStatus"
                          defaultValue="ANSWERED"
                          className="w-full h-8 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink focus:outline-none"
                        >
                          <option value="ANSWERED">🟢 Picked / Answered</option>
                          <option value="NOT_ANSWERED">🔴 Not Answered / Missed</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-900 mb-1">
                          Call Notes
                        </label>
                        <textarea
                          name="notes"
                          rows={2}
                          placeholder="Discussion details, monopoly terms, or missed reason..."
                          className="w-full rounded-xl border border-line bg-white p-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-900 mb-1">
                            Duration (sec)
                          </label>
                          <input
                            type="number"
                            name="durationSec"
                            defaultValue={180}
                            min={0}
                            className="w-full h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-900 mb-1">
                            New Outcome
                          </label>
                          <select
                            name="outcome"
                            defaultValue={LeadStatus.INTERESTED}
                            className="w-full h-8 rounded-lg border border-line bg-white px-1 text-xs text-ink"
                          >
                            <option value={LeadStatus.CONTACTED}>Contacted</option>
                            <option value={LeadStatus.INTERESTED}>Interested</option>
                            <option value={LeadStatus.CONVERTED}>Converted</option>
                            <option value={LeadStatus.NOT_INTERESTED}>Not Interested</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full h-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition cursor-pointer"
                      >
                        Save Call Touchpoint
                      </button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
