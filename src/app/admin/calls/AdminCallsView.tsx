"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { markWhatsAppAlertSent } from "@/lib/admin-actions";
import { craftAiWhatsAppMissedMessage } from "@/lib/call-helpers";

export interface CallFeedItem {
  id: string;
  targetName: string;
  targetPhone: string | null;
  direction: string;
  missed: boolean;
  durationSec: number;
  aiSummary: string | null;
  summary: string | null;
  behaviorTags: string[];
  whatsappSent: boolean;
  occurredAt: string;
  repId: string;
  repName: string;
  repPhone: string | null;
  leadTerritory: string | null;
  leadDivision: string | null;
  companyName: string;
}

export interface RepSummaryItem {
  id: string;
  name: string;
  phoneNumber: string;
  totalCalls: number;
  connectedCalls: number;
  missedCalls: number;
  connectionRate: number;
  avgDurationSec: number;
  whatsappSentCount: number;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function AdminCallsView({
  calls: initialCalls,
  reps,
  companyName,
}: {
  calls: CallFeedItem[];
  reps: RepSummaryItem[];
  companyName: string;
}) {
  const [callsList, setCallsList] = useState<CallFeedItem[]>(initialCalls);
  const [activeViewTab, setActiveViewTab] = useState<"FEED" | "MISSED" | "LEADERBOARD">("FEED");
  const [selectedRepId, setSelectedRepId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ANSWERED" | "MISSED" | "WHATSAPP_SENT">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingAlertCallId, setSendingAlertCallId] = useState<string | null>(null);

  // Global KPIs
  const totalCalls = callsList.length;
  const connectedCalls = callsList.filter((c) => !c.missed).length;
  const missedCalls = callsList.filter((c) => c.missed).length;
  const connectionRate = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0;
  const missedRate = totalCalls > 0 ? Math.round((missedCalls / totalCalls) * 100) : 0;
  const totalDurationSec = callsList.reduce((s, c) => s + (c.durationSec || 0), 0);
  const avgDurationSec = connectedCalls > 0 ? Math.round(totalDurationSec / connectedCalls) : 0;
  const whatsappSentCount = callsList.filter((c) => c.whatsappSent).length;

  // Unanswered Missed Calls requiring recovery
  const pendingMissedAlerts = useMemo(() => {
    return callsList.filter((c) => c.missed && !c.whatsappSent);
  }, [callsList]);

  // Filtered Calls Feed
  const filteredCalls = useMemo(() => {
    return callsList.filter((c) => {
      const matchesRep = selectedRepId === "ALL" || c.repId === selectedRepId;

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ANSWERED" && !c.missed) ||
        (statusFilter === "MISSED" && c.missed) ||
        (statusFilter === "WHATSAPP_SENT" && c.whatsappSent);

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.targetName.toLowerCase().includes(q) ||
        (c.targetPhone && c.targetPhone.includes(q)) ||
        c.repName.toLowerCase().includes(q) ||
        (c.leadTerritory && c.leadTerritory.toLowerCase().includes(q)) ||
        (c.aiSummary && c.aiSummary.toLowerCase().includes(q)) ||
        (c.summary && c.summary.toLowerCase().includes(q)) ||
        c.behaviorTags.some((t) => t.toLowerCase().includes(q));

      return matchesRep && matchesStatus && matchesSearch;
    });
  }, [callsList, selectedRepId, statusFilter, searchQuery]);

  async function handleSendAiWhatsAppAlert(call: CallFeedItem) {
    const rawPhone = call.targetPhone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      alert("No phone number available for this contact.");
      return;
    }
    const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

    const text = craftAiWhatsAppMissedMessage({
      leadName: call.targetName,
      repName: call.repName,
      companyName: call.companyName || companyName,
      division: call.leadDivision,
      territory: call.leadTerritory,
    });

    setSendingAlertCallId(call.id);

    // 1. Open WhatsApp web / intent
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, "_blank");

    // 2. Mark in database
    try {
      const fd = new FormData();
      fd.append("callId", call.id);
      await markWhatsAppAlertSent(fd);

      // 3. Optimistic local update
      setCallsList((prev) =>
        prev.map((c) => (c.id === call.id ? { ...c, whatsappSent: true } : c))
      );
    } catch (err) {
      console.error("Failed to mark WhatsApp alert sent", err);
    } finally {
      setSendingAlertCallId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. Top Executive Banner */}
      <section className="relative overflow-hidden rounded-3xl p-6 sm:p-8 neo-panel border-t-2 border-t-rose-500 bg-white shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-black text-rose-700">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                AI Telephony Intelligence Hub
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Company-Wide Telecalling Audit
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              AI Calls Summary & Telephony Insights
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs sm:text-sm leading-relaxed text-ink-muted">
              Real-time audit trail of all outbound & inbound calls across field representatives. Inspect AI executive summaries, prospect interest tags, answer rates, and recover unanswered inquiries with 1-tap WhatsApp alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/admin/employees"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>👥</span> View Representatives Directory
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Top Metric Scorecards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Calls Made</p>
          <p className="mt-2 text-2xl font-black text-ink">{totalCalls} Calls</p>
          <p className="mt-1 text-xs text-ink-muted">Across {reps.length} active reps</p>
        </div>

        <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Picked / Answered</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700">{connectedCalls}</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {connectionRate}% Picked
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Active client discussions</p>
        </div>

        <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-600 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Not Answered / Missed</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700">{missedCalls}</span>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {missedRate}% Missed
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Call went unanswered</p>
        </div>

        <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Avg Talk Duration</p>
          <p className="mt-2 text-2xl font-black text-indigo-700">{formatDuration(avgDurationSec)}</p>
          <p className="mt-1 text-xs text-ink-muted">For connected discussions</p>
        </div>

        <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-teal-600 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">WhatsApp Dispatched</p>
          <p className="mt-2 text-2xl font-black text-teal-700">{whatsappSentCount} Alerts</p>
          <p className="mt-1 text-xs text-ink-muted">AI recovery follow-ups sent</p>
        </div>
      </section>

      {/* 3. View Switcher Tabs (Live Feed First) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveViewTab("FEED")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
              activeViewTab === "FEED"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/25 scale-[1.02]"
                : "bg-white text-ink-muted border border-line hover:border-purple-300 hover:text-purple-700"
            }`}
          >
            <span>🎙️ Live AI Calls Feed</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeViewTab === "FEED" ? "bg-white/20 text-white" : "bg-slate-100 text-ink-muted"
              }`}
            >
              {filteredCalls.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab("MISSED")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
              activeViewTab === "MISSED"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/25 scale-[1.02]"
                : "bg-white text-ink-muted border border-line hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <span>⚡ Unanswered Recovery Desk</span>
            {pendingMissedAlerts.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeViewTab === "MISSED" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {pendingMissedAlerts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab("LEADERBOARD")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
              activeViewTab === "LEADERBOARD"
                ? "bg-primary text-white shadow-md shadow-primary/25 scale-[1.02]"
                : "bg-white text-ink-muted border border-line hover:border-primary/30 hover:text-primary"
            }`}
          >
            <span>📊 Sales Reps Leaderboard</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeViewTab === "LEADERBOARD" ? "bg-white/20 text-white" : "bg-slate-100 text-ink-muted"
              }`}
            >
              {reps.length}
            </span>
          </button>
        </div>

        {pendingMissedAlerts.length > 0 && activeViewTab !== "MISSED" && (
          <button
            type="button"
            onClick={() => setActiveViewTab("MISSED")}
            className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>{pendingMissedAlerts.length} Unanswered calls require WhatsApp follow-up &rarr;</span>
          </button>
        )}
      </div>

      {/* TAB 2: Missed Calls Queue */}
      {activeViewTab === "MISSED" && (
        <section className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-white border-2 border-amber-300 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white text-lg shadow-md shadow-amber-500/25">
                ⚡
              </span>
              <div>
                <h3 className="font-black text-ink text-base">
                  Missed Call Recovery Queue ({pendingMissedAlerts.length} Unanswered Inquiries Awaiting Action)
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  These prospects did not answer calls placed by your representatives. Dispatch AI-crafted follow-ups in 1 tap so inquiries don&apos;t slip away.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 self-start sm:self-auto border border-amber-300">
              Immediate Follow-up
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingMissedAlerts.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm font-semibold text-ink-muted">
                ✅ No pending unanswered calls! All prospects answered or followed up.
              </div>
            ) : (
              pendingMissedAlerts.map((call) => (
                <div
                  key={call.id}
                  className="rounded-2xl p-4 bg-white border border-amber-200 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-sm text-ink">{call.targetName}</h4>
                        <p className="font-mono text-xs text-ink-muted mt-0.5">{call.targetPhone || "No Phone"}</p>
                      </div>
                      <span className="rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5">
                        Missed
                      </span>
                    </div>

                    <p className="text-[11px] text-ink-faint mt-1.5 flex items-center gap-1">
                      <span>Rep:</span>
                      <strong className="text-ink">{call.repName}</strong>
                      {call.leadTerritory && <span>• 📍 {call.leadTerritory}</span>}
                    </p>

                    <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5 border border-line text-[11px] text-ink-muted italic">
                      &ldquo;Hello {call.targetName}, this is {call.repName} from {companyName}. We just tried calling you regarding your franchise inquiry...&rdquo;
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-2">
                    <span className="text-[10px] text-ink-faint font-medium">
                      {formatDate(call.occurredAt)} • {formatTime(call.occurredAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSendAiWhatsAppAlert(call)}
                      disabled={sendingAlertCallId === call.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <span>{sendingAlertCallId === call.id ? "⏳" : "⚡"}</span>
                      <span>Send AI WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 3: Leaderboard */}
      {activeViewTab === "LEADERBOARD" && (
        <section className="rounded-3xl p-6 neo-panel bg-white">
          <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-ink text-base">Representative Telecalling Leaderboard</h3>
              <p className="text-xs text-ink-muted mt-0.5">Call volumes, pickup rates, and AI summaries per sales representative</p>
            </div>
            <span className="text-xs font-semibold text-ink-muted">
              {reps.length} Field Reps Active
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px] bg-slate-50/60">
                <tr>
                  <th className="py-3 px-4">Sales Representative</th>
                  <th className="py-3 px-3">Total Calls</th>
                  <th className="py-3 px-3">Picked / Answered</th>
                  <th className="py-3 px-3">Not Answered</th>
                  <th className="py-3 px-3">Connection %</th>
                  <th className="py-3 px-3">Avg Duration</th>
                  <th className="py-3 px-3">WhatsApp Sent</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {reps.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xs shadow-xs">
                          {rep.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-extrabold text-ink text-xs">{rep.name}</p>
                          <p className="text-[10px] text-ink-faint font-mono">{rep.phoneNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-black text-ink">{rep.totalCalls}</td>
                    <td className="py-3.5 px-3 font-bold text-emerald-700">{rep.connectedCalls}</td>
                    <td className="py-3.5 px-3 font-bold text-rose-700">{rep.missedCalls}</td>
                    <td className="py-3.5 px-3 font-black text-indigo-700">{rep.connectionRate}%</td>
                    <td className="py-3.5 px-3 text-ink-muted">{formatDuration(rep.avgDurationSec)}</td>
                    <td className="py-3.5 px-3">
                      <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-[10px] font-bold">
                        {rep.whatsappSentCount} Sent
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/admin/employees/${rep.id}?tab=calls`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition shadow-2xs"
                      >
                        <span>🤖</span> Rep AI Summaries &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 1: Live Call Feed & AI Summaries (Shown when activeViewTab === "FEED") */}
      {activeViewTab === "FEED" && (
      <section className="rounded-3xl p-6 neo-panel bg-white">
        <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-black text-purple-700">
                <span>✨</span> AI Telephony Log
              </span>
              <span className="text-xs text-ink-faint">Executive Audit Feed</span>
            </div>
            <h3 className="font-extrabold text-ink text-lg mt-1">Live Call Feed & AI Discussion Summaries</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Filtered feed of discussions, prospect intent, behavioral tags, and 1-tap WhatsApp alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Rep Selector */}
            <select
              value={selectedRepId}
              onChange={(e) => setSelectedRepId(e.target.value)}
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-xs"
            >
              <option value="ALL">All Representatives ({reps.length})</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.totalCalls} calls)
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-xs"
            >
              <option value="ALL">All Call Outcomes</option>
              <option value="ANSWERED">🟢 Picked / Connected</option>
              <option value="MISSED">🔴 Not Answered / Missed</option>
              <option value="WHATSAPP_SENT">✓ WhatsApp Sent</option>
            </select>

            {/* Search Box */}
            <input
              type="text"
              placeholder="Search contact, notes, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 w-56 shadow-xs"
            />
          </div>
        </div>

        {/* Call Cards Stream */}
        <div className="mt-5 space-y-4">
          {filteredCalls.map((c) => {
            const isMissed = c.missed;
            const cleanPhone = (c.targetPhone || "").replace(/\D/g, "");

            return (
              <div
                key={c.id}
                className={`rounded-2xl p-5 border transition-all ${
                  isMissed
                    ? "border-amber-200/80 bg-amber-50/20 hover:bg-amber-50/40"
                    : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Left: Contact Info & Status */}
                  <div className="space-y-1.5 min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-ink text-base">{c.targetName}</h4>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                          isMissed
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {isMissed ? "📵 Not Answered / Missed" : "📞 Answered / Connected"}
                      </span>
                    </div>

                    {c.targetPhone && (
                      <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                        <span>📱 {c.targetPhone}</span>
                        <a
                          href={`tel:${cleanPhone}`}
                          className="text-primary hover:underline font-sans text-[11px] font-bold"
                        >
                          Call
                        </a>
                        <span>•</span>
                        <a
                          href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 hover:underline font-sans text-[11px] font-bold"
                        >
                          WhatsApp
                        </a>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <span>Rep: <strong className="text-ink">{c.repName}</strong></span>
                      <span>•</span>
                      <span>Direction: <strong className="text-ink">{c.direction}</strong></span>
                      <span>•</span>
                      <span>Duration: <strong className="text-ink">{formatDuration(c.durationSec)}</strong></span>
                      {c.leadTerritory && (
                        <>
                          <span>•</span>
                          <span>📍 {c.leadTerritory}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Middle: AI Call Summary & Key Takeaways */}
                  <div className="flex-1 rounded-2xl p-4 bg-slate-50/80 border border-line">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🤖</span>
                        <span className="text-[11px] font-black uppercase tracking-wider text-purple-800">
                          AI Executive Call Summary
                        </span>
                      </div>
                      <span className="text-[10px] text-ink-faint">
                        {formatDate(c.occurredAt)} at {formatTime(c.occurredAt)}
                      </span>
                    </div>

                    <p className="text-xs text-ink leading-relaxed whitespace-pre-line">
                      {c.aiSummary || c.summary || (isMissed ? "Outbound attempt unanswered. Recommend instant follow-up via WhatsApp." : "Routine follow-up conversation recorded.")}
                    </p>

                    {/* Behavioral Tags */}
                    {c.behaviorTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-line/60">
                        {c.behaviorTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg bg-white border border-line px-2 py-0.5 text-[10px] font-bold text-ink-muted shadow-2xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: WhatsApp Alert Action & Status */}
                  <div className="flex flex-col items-end justify-between gap-3 shrink-0">
                    <div>
                      {c.whatsappSent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 text-xs font-black">
                          <span>✓</span> AI WhatsApp Dispatched
                        </span>
                      ) : isMissed ? (
                        <button
                          type="button"
                          onClick={() => handleSendAiWhatsAppAlert(c)}
                          disabled={sendingAlertCallId === callId(c)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold shadow-sm transition disabled:opacity-50 cursor-pointer"
                          title="Send personalized AI follow-up message to this lead"
                        >
                          <span>{sendingAlertCallId === c.id ? "⏳" : "⚡"}</span>
                          <span>Send AI WhatsApp Alert</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-ink-faint">
                          Direct connected call
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/admin/employees/${c.repId}?tab=calls`}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      View Rep Profile &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredCalls.length === 0 && (
            <div className="rounded-2xl p-10 text-center neo-panel bg-slate-50 border border-line">
              <p className="text-sm font-bold text-ink">No calls matching current filters</p>
              <p className="text-xs text-ink-muted mt-1">Try resetting filters or search query.</p>
            </div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}

function callId(c: CallFeedItem): string {
  return c.id;
}
