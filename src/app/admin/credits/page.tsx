import {
  AiCallStatus,
  CreditStatus,
} from "@/generated/prisma/enums";
import {
  createCreditRecord,
  recordCreditPayment,
  toggleCreditAiAutomation,
  triggerAiCreditAlert,
  triggerAiCreditCall,
} from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";

export default async function AdminCreditManagementPage() {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const [credits, clients] = await Promise.all([
    prisma.creditRecord.findMany({
      where: activeCompanyId ? { client: { companyId: activeCompanyId } } : {},
      include: {
        client: {
          include: {
            territory: true,
            assignedEmployee: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.client.findMany({
      where: companyScope,
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  // Financial aggregates
  const totalCreditIssued = credits.reduce(
    (sum, c) => sum + Number(c.totalAmount),
    0
  );
  const totalPaid = credits.reduce((sum, c) => sum + Number(c.paidAmount), 0);
  const totalOutstanding = credits.reduce(
    (sum, c) => sum + Number(c.balanceAmount),
    0
  );

  const overdueCredits = credits.filter(
    (c) => c.status === CreditStatus.OVERDUE || (c.status !== CreditStatus.SETTLED && c.dueDate < now)
  );
  const overdueAmount = overdueCredits.reduce(
    (sum, c) => sum + Number(c.balanceAmount),
    0
  );

  const nearbyCredits = credits.filter((c) => {
    if (c.status === CreditStatus.SETTLED) return false;
    const diffDays = Math.ceil(
      (c.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays >= 0 && diffDays <= 3;
  });
  const nearbyAmount = nearbyCredits.reduce(
    (sum, c) => sum + Number(c.balanceAmount),
    0
  );

  const aiMessageActiveCount = credits.filter(
    (c) => c.sendAiMessage && c.status !== CreditStatus.SETTLED
  ).length;
  const aiCallActiveCount = credits.filter(
    (c) => c.enableAiCall && c.status !== CreditStatus.SETTLED
  ).length;

  // "Days Asked" terms grouping
  const termBuckets = [
    { label: "15 Days Credit", days: 15, tone: "blue" },
    { label: "30 Days Credit", days: 30, tone: "indigo" },
    { label: "45 Days Credit", days: 45, tone: "purple" },
    { label: "60+ Days Credit", days: 60, tone: "amber" },
  ];

  const termStats = termBuckets.map((b) => {
    const matched = credits.filter((c) =>
      b.days === 60 ? c.daysAsked >= 60 : c.daysAsked === b.days
    );
    const sumBalance = matched.reduce(
      (acc, c) => acc + Number(c.balanceAmount),
      0
    );
    return {
      ...b,
      count: matched.length,
      amount: sumBalance,
    };
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-emerald-500">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-56 w-56 rounded-full bg-gradient-to-br from-emerald-400/10 via-teal-500/10 to-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Credit Control & Liquidity Desk
              </span>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                AI Autonomous Chaser v2.1
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Credit Management & AI Collections
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Oversee product dispatches taken on credit terms, track the exact days requested by each franchise partner, 
              control who receives automated AI alert messages when payment dates are nearby, and dispatch autonomous AI voice collection calls.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 shrink-0">
            <div className="rounded-2xl p-3 neo-pressed border border-line text-center">
              <p className="text-xl font-extrabold text-emerald-600">
                {aiMessageActiveCount}
              </p>
              <p className="text-[11px] font-semibold text-ink-faint">AI Messages Active</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed border border-line text-center">
              <p className="text-xl font-extrabold text-indigo-600">
                {aiCallActiveCount}
              </p>
              <p className="text-[11px] font-semibold text-ink-faint">AI Calls Queued</p>
            </div>
            <div className="rounded-2xl p-3 neo-pressed border border-line text-center col-span-2 sm:col-span-1">
              <p className="text-xl font-extrabold text-rose-600">
                {overdueCredits.length}
              </p>
              <p className="text-[11px] font-semibold text-ink-faint">Overdue Accounts</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Financial KPI Cards */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CreditKpiCard
          title="Total Outstanding Credit"
          value={formatCurrency(totalOutstanding)}
          detail={`₹${(totalPaid / 100000).toFixed(2)}L settled from ₹${(totalCreditIssued / 100000).toFixed(2)}L`}
          topBar="from-emerald-400 via-teal-500 to-emerald-600"
          icon={
            <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-emerald-50 border-emerald-200"
          tag="Active Book"
          tagClass="bg-emerald-50 text-emerald-700 border-emerald-200"
        />

        <CreditKpiCard
          title="Nearby Due (< 3 Days)"
          value={formatCurrency(nearbyAmount)}
          detail={`${nearbyCredits.length} franchise accounts due within 72 hrs`}
          topBar="from-amber-400 via-orange-500 to-amber-600"
          icon={
            <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-amber-50 border-amber-200"
          tag="Urgent Attention"
          tagClass="bg-amber-50 text-amber-700 border-amber-200"
        />

        <CreditKpiCard
          title="Overdue Risk Balance"
          value={formatCurrency(overdueAmount)}
          detail={`${overdueCredits.length} accounts exceeding agreed credit term`}
          topBar="from-rose-400 via-red-500 to-rose-600"
          icon={
            <svg className="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          iconBg="bg-rose-50 border-rose-200"
          tag="High Risk"
          tagClass="bg-rose-50 text-rose-700 border-rose-200"
        />

        <CreditKpiCard
          title="AI Recovery Coverage"
          value={`${credits.length > 0 ? Math.round(((aiMessageActiveCount + aiCallActiveCount) / (credits.length * 2)) * 100) : 0}%`}
          detail={`${aiMessageActiveCount} AI alerts · ${aiCallActiveCount} AI phone bots`}
          topBar="from-indigo-400 via-purple-500 to-indigo-600"
          icon={
            <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          iconBg="bg-indigo-50 border-indigo-200"
          tag="Autonomous"
          tagClass="bg-indigo-50 text-indigo-700 border-indigo-200"
        />
      </section>

      {/* "Days Asked" Credit Terms Intelligence Panel */}
      <section className="rounded-3xl p-6 neo-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <h2 className="font-bold text-ink text-base">
                Credit Terms Requested ("Days Asked") Intelligence
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              Distribution of payment tenure requested by pharmaceutical distributors to guide automated reminder cadence.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary-soft px-3 py-1 rounded-full border border-primary/20">
            Cadence Rule: AI Alert triggers 3 days prior to maturity date
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {termStats.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl p-4 neo-pressed border border-line flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {item.label}
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-ink shadow-xs border border-line">
                  {item.count} {item.count === 1 ? "Client" : "Clients"}
                </span>
              </div>

              <div className="my-3">
                <p className="text-2xl font-black text-ink">
                  {formatCurrency(item.amount)}
                </p>
                <p className="text-[11px] text-ink-faint mt-0.5">
                  Outstanding on {item.days}-day term
                </p>
              </div>

              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[10px] text-ink-faint">
                <span>Alert Window:</span>
                <span className="font-bold text-emerald-600">
                  Day {Math.max(1, item.days - 3)} onwards
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Grant Product Credit Form (Add New Credit) */}
      <section className="rounded-3xl p-6 neo-panel">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-bold text-ink text-base">
              Grant Product Credit to Franchise Partner
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Issue an authorized consignment or order under agreed payment credit tenure.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-bold">
            Live Database Sync
          </span>
        </div>

        <form action={createCreditRecord} className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Select Client Partner *
            </label>
            <select name="clientId" required className={formInputClass} defaultValue="">
              <option value="" disabled>Choose franchise client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phoneNumber || "No phone"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Invoice / Ref Number *
            </label>
            <input
              name="invoiceNumber"
              required
              placeholder="e.g. INV-2026-CR07"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Total Invoice Amount (₹) *
            </label>
            <input
              name="totalAmount"
              type="number"
              required
              min="100"
              placeholder="e.g. 150000"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Advance Paid (₹)
            </label>
            <input
              name="paidAmount"
              type="number"
              min="0"
              defaultValue="0"
              placeholder="0"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Credit Term / Days Asked *
            </label>
            <select name="daysAsked" className={formInputClass} defaultValue="30">
              <option value="15">15 Days (Urgent Cadence)</option>
              <option value="30">30 Days (Standard Monthly)</option>
              <option value="45">45 Days (Extended Quarterly)</option>
              <option value="60">60 Days (Institutional)</option>
              <option value="90">90 Days (Long-term Consignment)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Products Taken on Credit
            </label>
            <input
              name="productDetails"
              placeholder="e.g. Cefixime 200mg (400 boxes), PCM (200 strips)"
              className={formInputClass}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Notes / Agreement Terms
            </label>
            <input
              name="notes"
              placeholder="e.g. Partner promised RTGS upon stock delivery at Ludhiana hub"
              className={formInputClass}
            />
          </div>

          {/* AI Management Checkboxes */}
          <div className="flex flex-col justify-center gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                type="checkbox"
                name="sendAiMessage"
                defaultChecked
                className="h-4 w-4 rounded-md border-line text-emerald-600 focus:ring-emerald-500/40"
              />
              <span>Send AI Message Alert when due date is nearby</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                type="checkbox"
                name="enableAiCall"
                defaultChecked
                className="h-4 w-4 rounded-md border-line text-indigo-600 focus:ring-indigo-500/40"
              />
              <span>Enable autonomous AI Voice Call if unpaid</span>
            </label>
          </div>

          <div className="md:col-span-3 pt-2">
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg transition-all cursor-pointer"
            >
              + Issue Credit Record & Activate AI Tracking
            </button>
          </div>
        </form>
      </section>

      {/* Credit Ledger with Full AI Alert & Call Controls */}
      <section className="overflow-hidden rounded-3xl neo-panel">
        <div className="border-b border-line px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50/40">
          <div>
            <h2 className="font-bold text-ink text-base">
              Active Credit Accounts & AI Dispatch Desk
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Admin control center to trigger live reminders, toggle automated AI alerts, initiate AI voice calls, and log payments.
            </p>
          </div>
          <span className="text-xs font-bold text-ink-muted bg-white border border-line rounded-full px-3 py-1 shadow-xs">
            {credits.length} Credit Accounts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-6 py-3.5">Client & Territory</th>
                <th className="px-6 py-3.5">Invoice & Products</th>
                <th className="px-6 py-3.5">Days Asked & Maturity</th>
                <th className="px-6 py-3.5">Financials (₹)</th>
                <th className="px-6 py-3.5">AI Message Alert</th>
                <th className="px-6 py-3.5">AI Voice Call</th>
                <th className="px-6 py-3.5">Payment Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {credits.map((cr) => {
                const diffDays = Math.ceil(
                  (cr.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                const isOverdue = diffDays < 0 && cr.status !== CreditStatus.SETTLED;
                const isNearby =
                  diffDays >= 0 && diffDays <= 3 && cr.status !== CreditStatus.SETTLED;
                const isSettled = cr.status === CreditStatus.SETTLED || Number(cr.balanceAmount) <= 0;

                // Days progress
                const elapsedDays = Math.max(
                  0,
                  Math.floor(
                    (now.getTime() - cr.invoiceDate.getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                );
                const progressPct = Math.min(
                  100,
                  Math.round((elapsedDays / cr.daysAsked) * 100)
                );

                return (
                  <tr key={cr.id} className="hover:bg-slate-50/60 transition">
                    {/* Client & Territory */}
                    <td className="px-6 py-4">
                      <p className="font-bold text-ink">{cr.client.name}</p>
                      <p className="text-xs text-ink-faint mt-0.5">
                        {cr.client.phoneNumber || "No phone registered"}
                      </p>
                      {cr.client.territory && (
                        <span className="inline-block mt-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          {cr.client.territory.city}, {cr.client.territory.state}
                        </span>
                      )}
                    </td>

                    {/* Invoice & Products */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-ink bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {cr.invoiceNumber}
                      </span>
                      <p className="text-xs text-ink-muted mt-1 max-w-xs line-clamp-2">
                        {cr.productDetails || "General pharmaceutical consignment"}
                      </p>
                      <p className="text-[10px] text-ink-faint mt-0.5">
                        Issued: {cr.invoiceDate.toLocaleDateString("en-IN")}
                      </p>
                    </td>

                    {/* Days Asked & Maturity */}
                    <td className="px-6 py-4 min-w-44">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-primary">{cr.daysAsked} Days Asked</span>
                        {isSettled ? (
                          <span className="text-emerald-600">Settled</span>
                        ) : isOverdue ? (
                          <span className="text-rose-600">
                            {Math.abs(diffDays)}d overdue
                          </span>
                        ) : (
                          <span className={isNearby ? "text-amber-600 font-extrabold" : "text-ink-muted"}>
                            {diffDays}d left
                          </span>
                        )}
                      </div>

                      {/* Maturity Progress Bar */}
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isSettled
                              ? "bg-emerald-500"
                              : isOverdue
                              ? "bg-rose-500"
                              : isNearby
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{ width: `${isSettled ? 100 : progressPct}%` }}
                        />
                      </div>

                      <p className="text-[11px] text-ink-faint mt-1">
                        Due: {cr.dueDate.toLocaleDateString("en-IN")}
                      </p>
                    </td>

                    {/* Financials */}
                    <td className="px-6 py-4">
                      <p className="font-extrabold text-ink text-sm">
                        ₹{Number(cr.balanceAmount).toLocaleString("en-IN")}
                      </p>
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        Total: ₹{Number(cr.totalAmount).toLocaleString("en-IN")}
                      </p>
                      <p className="text-[11px] text-emerald-600 font-medium">
                        Paid: ₹{Number(cr.paidAmount).toLocaleString("en-IN")}
                      </p>
                    </td>

                    {/* AI Message Alert Management */}
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <form action={toggleCreditAiAutomation}>
                            <input type="hidden" name="creditId" value={cr.id} />
                            <input type="hidden" name="field" value="message" />
                            <input
                              type="hidden"
                              name="enable"
                              value={cr.sendAiMessage ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition cursor-pointer ${
                                cr.sendAiMessage
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                  : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                              }`}
                              title="Click to toggle AI message alert on/off"
                            >
                              {cr.sendAiMessage ? "AI Alert ON" : "AI Alert OFF"}
                            </button>
                          </form>

                          {isNearby && (
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Nearby due date alert active" />
                          )}
                        </div>

                        {/* Dispatch AI Alert button */}
                        {!isSettled && (
                          <form action={triggerAiCreditAlert}>
                            <input type="hidden" name="creditId" value={cr.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 neo-button hover:bg-emerald-50 hover:border-emerald-300 transition shadow-xs cursor-pointer"
                            >
                              <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                              <span>Send Alert</span>
                            </button>
                          </form>
                        )}

                        {cr.lastAiMessageAt && (
                          <p className="text-[10px] text-ink-faint">
                            Sent: {cr.lastAiMessageAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* AI Voice Call Management */}
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <form action={toggleCreditAiAutomation}>
                            <input type="hidden" name="creditId" value={cr.id} />
                            <input type="hidden" name="field" value="call" />
                            <input
                              type="hidden"
                              name="enable"
                              value={cr.enableAiCall ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition cursor-pointer ${
                                cr.enableAiCall
                                  ? "bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200"
                                  : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                              }`}
                              title="Click to toggle AI voice call on/off"
                            >
                              {cr.enableAiCall ? "AI Call ON" : "AI Call OFF"}
                            </button>
                          </form>
                        </div>

                        {/* Call Status Badge */}
                        <div>
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold border ${getAiCallStatusBadgeClass(cr.aiCallStatus)}`}>
                            {cr.aiCallStatus.replace("_", " ")}
                          </span>
                        </div>

                        {/* Dispatch AI Call button */}
                        {!isSettled && (
                          <form action={triggerAiCreditCall}>
                            <input type="hidden" name="creditId" value={cr.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 neo-button hover:bg-indigo-50 hover:border-indigo-300 transition shadow-xs cursor-pointer"
                            >
                              <svg className="h-3.5 w-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a11 1.042 11.042 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span>Call via AI</span>
                            </button>
                          </form>
                        )}

                        {cr.aiCallSummary && (
                          <p className="text-[10px] text-indigo-900 bg-indigo-50/80 p-1.5 rounded-lg border border-indigo-100 max-w-xs leading-relaxed" title={cr.aiCallSummary}>
                            {cr.aiCallSummary.length > 60 ? `${cr.aiCallSummary.slice(0, 60)}...` : cr.aiCallSummary}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Payment Settlement */}
                    <td className="px-6 py-4">
                      {isSettled ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 text-xs font-bold">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          Paid in Full
                        </span>
                      ) : (
                        <form action={recordCreditPayment} className="flex flex-col gap-1.5">
                          <input type="hidden" name="creditId" value={cr.id} />
                          <input
                            name="paymentAmount"
                            type="number"
                            min="1"
                            max={Number(cr.balanceAmount)}
                            defaultValue={Number(cr.balanceAmount)}
                            className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink shadow-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                          >
                            Record Pay
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!credits.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-ink-faint">
                    No credit records created yet. Use the form above to grant product credit to a client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CreditKpiCard({
  title,
  value,
  detail,
  topBar,
  icon,
  iconBg,
  tag,
  tagClass,
}: {
  title: string;
  value: string;
  detail: string;
  topBar: string;
  icon: React.ReactNode;
  iconBg: string;
  tag: string;
  tagClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl neo-panel-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className={`h-1.5 w-full bg-gradient-to-r ${topBar}`} />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            {title}
          </p>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${iconBg} shadow-xs`}>
            {icon}
          </div>
        </div>

        <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
          {value}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">
            {detail}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${tagClass}`}>
            {tag}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAiCallStatusBadgeClass(status: AiCallStatus) {
  switch (status) {
    case AiCallStatus.PROMISED_TO_PAY:
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case AiCallStatus.SCHEDULED:
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    case AiCallStatus.DIALING:
      return "bg-amber-100 text-amber-800 border-amber-300 animate-pulse";
    case AiCallStatus.COMPLETED:
      return "bg-teal-100 text-teal-800 border-teal-300";
    case AiCallStatus.FAILED:
      return "bg-rose-100 text-rose-800 border-rose-300";
    default:
      return "bg-slate-100 text-slate-600 border-slate-300";
  }
}

const formInputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition";
