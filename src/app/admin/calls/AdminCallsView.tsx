"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { markWhatsAppAlertSent, toggleCallFollowUpFlag } from "@/lib/admin-actions";
import { craftAiWhatsAppMissedMessage, classifyCallLead } from "@/lib/call-helpers";
import { CallIntelligenceDocumentModal } from "@/components/CallIntelligenceDocumentModal";
import { GradientText } from "@/components/GradientText";

export interface CallFeedItem {
  id: string;
  leadId: string | null;
  targetName: string;
  targetPhone: string | null;
  direction: string;
  missed: boolean;
  durationSec: number;
  transcript?: string | null;
  aiSummary: string | null;
  summary: string | null;
  behaviorTags: string[];
  recordingUrl?: string | null;
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

const FOLLOW_UP_TAG = "Follow-Up";
const CALLS_PAGE_SIZE = 10;

function isFollowUpFlagged(call: CallFeedItem): boolean {
  return call.behaviorTags.some((t) => t.toLowerCase() === FOLLOW_UP_TAG.toLowerCase());
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
  const [activeViewTab] = useState<"DOCUMENTS">("DOCUMENTS");
  const [selectedRepId, setSelectedRepId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ANSWERED" | "MISSED" | "WHATSAPP_SENT">("ALL");
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "YESTERDAY" | "7DAYS" | "THIS_MONTH" | "CUSTOM">("ALL");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [leadCategoryFilter, setLeadCategoryFilter] = useState<"ALL" | "HOT" | "WARM" | "COLD" | "DEAD">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingAlertCallId, setSendingAlertCallId] = useState<string | null>(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [activeDocCallId, setActiveDocCallId] = useState<string | null>(null);
  const [selectedEmbeddedDocId, setSelectedEmbeddedDocId] = useState<string>("");
  const [copiedEmbeddedBrief, setCopiedEmbeddedBrief] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [callsPage, setCallsPage] = useState(1);
  const [togglingFollowUpId, setTogglingFollowUpId] = useState<string | null>(null);
  const [followUpHistoryOpen, setFollowUpHistoryOpen] = useState(false);

  const runDriveSync = async (forceNext = false) => {
    try {
      setIsSyncingDrive(true);
      const res = await fetch("/api/telephony/sync-drive", {
        cache: "no-store",
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.calls && Array.isArray(data.calls) && data.calls.length > 0) {
          setCallsList((prev) => {
            // Merge: update existing by ID, append new ones
            const prevMap = new Map(prev.map((c) => [c.id, c]));
            data.calls.forEach((c: CallFeedItem) => prevMap.set(c.id, c));
            return Array.from(prevMap.values()).sort(
              (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
            );
          });
        }
        if (data.remainingToSync > 0) {
          setTimeout(() => runDriveSync(true), 1200);
        }
      }
    } catch (err) {
      console.error("Drive sync error:", err);
    } finally {
      if (!forceNext) {
        setIsSyncingDrive(false);
      }
    }
  };

  useEffect(() => {
    // Initial and periodic background sync from Google Drive
    runDriveSync();
    const interval = setInterval(() => {
      runDriveSync();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  function handleOpenCallDoc(callId: string) {
    setActiveDocCallId(callId);
    setDocModalOpen(true);
  }

  function handleCopyEmbeddedDocument(call: CallFeedItem) {
    if (!call) return;
    const cleanPhone = call.targetPhone || "Not specified";
    const leadVerdict = classifyCallLead(call);
    const text = `=====================================================
ALLOTA AI CALL INTELLIGENCE REPORT [CONFIDENTIAL]
Reference ID: DOC-CALL-${call.id.slice(-8).toUpperCase()}
Company: Allota AI
Representative: ${call.repName} (${call.repPhone || "Field"})
Contact Party: ${call.targetName} (${cleanPhone})
Date & Time: ${formatDate(call.occurredAt)} at ${formatTime(call.occurredAt)}
Duration: ${formatDuration(call.durationSec)} (${call.missed ? "MISSED" : "CONNECTED"})
AI Lead Verdict: ${leadVerdict.label} (${leadVerdict.reason})
Territory: ${call.leadTerritory || "General Territory"}
=====================================================

[EXECUTIVE SUMMARY]
${call.aiSummary || call.summary || "Call completed without summary."}

[BEHAVIOR & TOPIC TAGS]
${call.behaviorTags.join(", ") || "None"}

[VERBATIM CALL TRANSCRIPT]
${call.transcript || "No audio transcript available."}

Report generated via Allota AI Telephony Engine
=====================================================`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedEmbeddedBrief(true);
      setTimeout(() => setCopiedEmbeddedBrief(false), 2500);
    });
  }

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

      // Date Filtering
      if (datePreset !== "ALL") {
        const callDate = new Date(c.occurredAt);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        const startOf7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        if (datePreset === "TODAY") {
          if (callDate < startOfToday) return false;
        } else if (datePreset === "YESTERDAY") {
          if (callDate < startOfYesterday || callDate > endOfYesterday) return false;
        } else if (datePreset === "7DAYS") {
          if (callDate < startOf7Days) return false;
        } else if (datePreset === "THIS_MONTH") {
          if (callDate < startOfMonth) return false;
        } else if (datePreset === "CUSTOM") {
          if (customStartDate && callDate < new Date(`${customStartDate}T00:00:00`)) return false;
          if (customEndDate && callDate > new Date(`${customEndDate}T23:59:59`)) return false;
        }
      }

      // Lead Category Filtering
      if (leadCategoryFilter !== "ALL") {
        const leadClass = classifyCallLead(c);
        if (leadClass.category !== leadCategoryFilter) return false;
      }

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
  }, [callsList, selectedRepId, statusFilter, datePreset, customStartDate, customEndDate, leadCategoryFilter, searchQuery]);

  const activeEmbeddedCall = useMemo(() => {
    return (
      filteredCalls.find((c) => c.id === selectedEmbeddedDocId) ||
      callsList.find((c) => c.id === selectedEmbeddedDocId) ||
      filteredCalls[0] ||
      callsList[0] ||
      null
    );
  }, [selectedEmbeddedDocId, filteredCalls, callsList]);

  // Reset to page 1 whenever the filtered result set changes shape
  useEffect(() => {
    setCallsPage(1);
  }, [selectedRepId, statusFilter, datePreset, customStartDate, customEndDate, leadCategoryFilter, searchQuery]);

  const totalCallsPages = Math.max(1, Math.ceil(filteredCalls.length / CALLS_PAGE_SIZE));
  const paginatedCalls = useMemo(() => {
    const start = (callsPage - 1) * CALLS_PAGE_SIZE;
    return filteredCalls.slice(start, start + CALLS_PAGE_SIZE);
  }, [filteredCalls, callsPage]);

  // Every other Follow-Up-flagged call for the same lead as the active call, most recent first
  const followUpHistoryForActiveLead = useMemo(() => {
    if (!activeEmbeddedCall?.leadId) return [];
    return callsList
      .filter((c) => c.leadId === activeEmbeddedCall.leadId && isFollowUpFlagged(c))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [callsList, activeEmbeddedCall]);

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

  async function handleToggleFollowUp(call: CallFeedItem) {
    const nextFlagged = !isFollowUpFlagged(call);
    setTogglingFollowUpId(call.id);
    try {
      const fd = new FormData();
      fd.append("callId", call.id);
      fd.append("flagged", String(nextFlagged));
      await toggleCallFollowUpFlag(fd);

      setCallsList((prev) =>
        prev.map((c) => {
          if (c.id !== call.id) return c;
          const withoutTag = c.behaviorTags.filter((t) => t.toLowerCase() !== FOLLOW_UP_TAG.toLowerCase());
          return { ...c, behaviorTags: nextFlagged ? [...withoutTag, FOLLOW_UP_TAG] : withoutTag };
        })
      );
    } catch (err) {
      console.error("Failed to toggle Follow-Up flag", err);
    } finally {
      setTogglingFollowUpId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. Top Executive Banner */}
      <section className="relative overflow-hidden rounded-3xl p-6 sm:p-8 neo-panel border-t-2 border-t-rose-500 bg-white shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              AI Calls Summary & Telephony <GradientText>Insights</GradientText>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={isSyncingDrive}
              onClick={() => runDriveSync()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-600/25 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              <span className={isSyncingDrive ? "animate-spin" : ""}>🔄</span>
              <span>{isSyncingDrive ? "Syncing Google Drive..." : "Sync Google Drive Calls"}</span>
            </button>

            <Link
              href="/admin/employees"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>👥</span> View Representatives Directory
            </Link>
          </div>
        </div>
      </section>

      {/* Calls today vs a chosen date, and lead-quality pie */}
      <section className="grid gap-4 md:grid-cols-2">
        <CallsTodayVsDate calls={callsList} />
        <LeadQualityPie calls={callsList} />
      </section>

      {/* ============================================================ */}
      {/* TAB 0: DEDICATED TRANSCRIPTS & AI SUMMARIES DOCUMENT WORKSPACE */}
      {/* ============================================================ */}
      {activeViewTab === "DOCUMENTS" && (
        <section className="space-y-6">
          {/* Top Info Banner */}
          <div className="rounded-3xl p-6 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">
                  Allota AI Telephony: Verbatim Transcripts & Hinglish Summaries
                </h2>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenCallDoc(activeEmbeddedCall?.id || filteredCalls[0]?.id)}
                  disabled={!activeEmbeddedCall}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white text-purple-900 px-4 py-2.5 text-xs font-black shadow-lg hover:bg-purple-50 active:scale-95 transition cursor-pointer"
                >
                  <span>🔲</span>
                  <span>Expand Full Screen Reader</span>
                </button>
              </div>
            </div>
          </div>

          {/* Master-Detail Document Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Call Directory & Filter (5 cols) */}
            <div className="lg:col-span-5 neo-panel rounded-3xl p-5 bg-white border border-line space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
                    <span>🎙️</span> Call Audio Logs
                  </h3>
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    Showing {filteredCalls.length} calls logged
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepId("ALL");
                    setStatusFilter("ALL");
                    setDatePreset("ALL");
                    setCustomStartDate("");
                    setCustomEndDate("");
                    setLeadCategoryFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>

              {/* Filters Suite */}
              <div className="space-y-3">
                {/* 1. Date Filter Toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">📅 Date Range</span>
                    {datePreset !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => setDatePreset("ALL")}
                        className="text-[10px] font-bold text-purple-700 hover:underline"
                      >
                        All Dates
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {[
                      { key: "ALL", label: "All Time" },
                      { key: "TODAY", label: "Today" },
                      { key: "YESTERDAY", label: "Yesterday" },
                      { key: "7DAYS", label: "7 Days" },
                      { key: "THIS_MONTH", label: "This Month" },
                      { key: "CUSTOM", label: "Custom" },
                    ].map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setDatePreset(p.key as any)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          datePreset === p.key
                            ? "bg-purple-700 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {datePreset === "CUSTOM" && (
                    <div className="mt-2 grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400">From Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400">To Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. AI Lead Status Filter Toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">🎯 AI Lead Status</span>
                    {leadCategoryFilter !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => setLeadCategoryFilter("ALL")}
                        className="text-[10px] font-bold text-purple-700 hover:underline"
                      >
                        All Leads
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {[
                      { key: "ALL", label: "All Leads" },
                      { key: "HOT", label: "🔥 Hot Lead" },
                      { key: "WARM", label: "⚡ Warm Lead" },
                      { key: "COLD", label: "❄️ Cold Lead" },
                      { key: "DEAD", label: "💀 Dead" },
                    ].map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        onClick={() => setLeadCategoryFilter(l.key as any)}
                        className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          leadCategoryFilter === l.key
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Rep & Status Selectors */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedRepId}
                    onChange={(e) => setSelectedRepId(e.target.value)}
                    className="rounded-xl border border-line bg-slate-50/70 px-2.5 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-inner"
                  >
                    <option value="ALL">All Representatives ({reps.length})</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.totalCalls})
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="rounded-xl border border-line bg-slate-50/70 px-2.5 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-inner"
                  >
                    <option value="ALL">All Outcomes</option>
                    <option value="ANSWERED">🟢 Connected</option>
                    <option value="MISSED">🔴 Missed</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Search transcript dialog, contact, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-line bg-slate-50/70 px-3 py-2 text-xs text-ink focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-inner"
                />
              </div>

              {/* Call Cards List */}
              <div className="space-y-2.5 max-h-[620px] overflow-y-auto p-1">
                {filteredCalls.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No calls match current filters.
                  </div>
                ) : (
                  paginatedCalls.map((c) => {
                    const isSelected = activeEmbeddedCall?.id === c.id;
                    const isMissed = c.missed;
                    const flagged = isFollowUpFlagged(c);

                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedEmbeddedDocId(c.id);
                          if (typeof window !== "undefined" && window.innerWidth < 1024) {
                            handleOpenCallDoc(c.id);
                          }
                        }}
                        className={`rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 border border-violet-300 shadow-md"
                            : "bg-white border border-line hover:border-violet-200 hover:bg-gradient-to-r hover:from-sky-50 hover:via-violet-50 hover:to-orange-50 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-black text-xs shadow-xs">
                              {c.repName.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-black text-purple-800 truncate">
                                  {c.repName}
                                </span>
                                {c.leadTerritory && (
                                  <span className="text-[10px] text-slate-400 font-medium truncate">
                                    • {c.leadTerritory}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-extrabold text-xs text-ink truncate">
                                {c.targetName}
                              </h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {flagged && (
                              <span className="rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 bg-sky-100 text-sky-800 border border-sky-200">
                                🔔 Follow Up
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 ${classifyCallLead(c).badgeClass}`}>
                              {classifyCallLead(c).label}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 ${
                                isMissed
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {isMissed ? "Missed" : `${formatDuration(c.durationSec)}`}
                            </span>
                          </div>
                        </div>

                        {/* Summary Snippet */}
                        <p className="mt-2 line-clamp-2 text-[11px] text-slate-600 leading-snug">
                          {c.aiSummary || c.summary || (isMissed ? "Prospect did not answer attempt." : "Recording saved.")}
                        </p>

                        <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center justify-between text-[10px] text-ink-faint">
                          <span>{formatDate(c.occurredAt)} • {formatTime(c.occurredAt)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCallDoc(c.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-600 text-purple-800 hover:text-white font-bold text-[10px] transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <span>📑</span> Open Document & Transcript
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              {filteredCalls.length > CALLS_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    disabled={callsPage === 1}
                    onClick={() => setCallsPage((p) => Math.max(1, p - 1))}
                    className="h-7 w-7 rounded-lg border border-line bg-white text-xs font-bold text-ink-muted disabled:opacity-30 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalCallsPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCallsPage(pageNum)}
                      className={`h-7 min-w-7 px-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        callsPage === pageNum
                          ? "bg-purple-600 text-white shadow-xs"
                          : "border border-line bg-white text-ink-muted hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={callsPage === totalCallsPages}
                    onClick={() => setCallsPage((p) => Math.min(totalCallsPages, p + 1))}
                    className="h-7 w-7 rounded-lg border border-line bg-white text-xs font-bold text-ink-muted disabled:opacity-30 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Clean Executive Document View (7 cols) */}
            <div className="lg:col-span-7">
              {activeEmbeddedCall ? (
                <article className="rounded-3xl bg-white p-6 sm:p-9 shadow-lg border border-slate-200 relative neo-panel">
                  
                  {/* Top Letterhead */}
                  <div className="border-b-2 border-slate-900 pb-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-0.5">
                          EXECUTIVE CALL INTELLIGENCE BRIEF
                        </h1>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-[10px] font-black tracking-wider uppercase">
                          CONFIDENTIAL
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          REF: DOC-CALL-{activeEmbeddedCall.id.slice(-8).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Strip */}
                    <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          Field Representative
                        </span>
                        <p className="font-extrabold text-slate-900 mt-0.5">
                          {activeEmbeddedCall.repName}
                        </p>
                        {activeEmbeddedCall.repPhone && (
                          <p className="font-mono text-[11px] text-slate-500">{activeEmbeddedCall.repPhone}</p>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          Customer / Lead
                        </span>
                        <p className="font-extrabold text-slate-900 mt-0.5">
                          {activeEmbeddedCall.targetName}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {activeEmbeddedCall.targetPhone || "Direct Call"}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          Timestamp & Duration
                        </span>
                        <p className="font-extrabold text-slate-900 mt-0.5">
                          {formatDate(activeEmbeddedCall.occurredAt)} • {formatTime(activeEmbeddedCall.occurredAt)}
                        </p>
                        <p className="text-[11px] text-slate-600 font-bold">
                          Talk Time: {formatDuration(activeEmbeddedCall.durationSec)}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          Connection Status
                        </span>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                              activeEmbeddedCall.missed
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {activeEmbeddedCall.missed ? "📵 Missed" : "📞 Connected"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Direction: {activeEmbeddedCall.direction}
                        </p>
                      </div>
                    </div>

                    {/* AI Lead Verdict Banner */}
                    {(() => {
                      const activeLeadClass = classifyCallLead(activeEmbeddedCall);
                      return (
                        <div className="mt-4 rounded-2xl bg-gradient-to-r from-purple-50/70 via-slate-50 to-indigo-50/50 p-4 border border-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`rounded-xl px-3 py-1.5 text-xs font-black shadow-xs ${activeLeadClass.badgeClass}`}>
                              {activeLeadClass.label}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-900">{activeLeadClass.reason}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">AI Lead Classification based on call audio dialogue</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Section 1: Executive Call Summary */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-700 text-xs font-black">
                        1
                      </span>
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Executive Summary & Commercial Intent (Hinglish)
                      </h2>
                    </div>

                    <div className="rounded-2xl border-l-4 border-l-purple-600 bg-purple-50/40 p-4 sm:p-5 border border-purple-100">
                      <p className="text-sm text-slate-800 leading-relaxed font-serif whitespace-pre-line">
                        {activeEmbeddedCall.aiSummary || activeEmbeddedCall.summary || (
                          activeEmbeddedCall.missed
                            ? "Outbound voice connection attempt was unanswered by the customer. Follow-up queued."
                            : "Call completed without an executive summary."
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Section 2: PCD Commercial Intelligence */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">
                        2
                      </span>
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        PCD Franchise & Molecule Intelligence
                      </h2>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          📍 Exclusive Territory
                        </p>
                        <p className="text-xs font-bold text-slate-800 mt-0.5">
                          {activeEmbeddedCall.leadTerritory || "General Territory / Direct Prospect"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
                          🏢 Commercial Division
                        </p>
                        <p className="text-xs font-bold text-slate-800 mt-0.5">
                          {activeEmbeddedCall.leadDivision === "THIRD_PARTY"
                            ? "Third-Party Contract Manufacturing"
                            : "PCD Pharma Franchise Monopoly"}
                        </p>
                      </div>
                    </div>

                    {activeEmbeddedCall.behaviorTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400 mr-1">Tags:</span>
                        {activeEmbeddedCall.behaviorTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Verbatim Call Transcript */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">
                          3
                        </span>
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                          Verbatim Audio Transcript
                        </h2>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        Audio Dialogue
                      </span>
                    </div>

                    {activeEmbeddedCall.transcript ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs max-h-72 overflow-y-auto">
                        {activeEmbeddedCall.transcript.split("\n").filter(l => l.trim().length > 0).map((line, idx) => {
                          const repFirst = (activeEmbeddedCall.repName || "").split(" ")[0].toLowerCase();
                        const isRep =
                          line.toLowerCase().startsWith("employee:") ||
                          line.toLowerCase().startsWith("representative:") ||
                          line.toLowerCase().startsWith("rep:") ||
                          line.toLowerCase().startsWith("speaker 1:") ||
                          (repFirst.length > 2 && line.toLowerCase().startsWith(`${repFirst}:`));

                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-xl ${
                                isRep
                                  ? "bg-white border border-purple-100 text-purple-950 font-medium shadow-2xs"
                                  : "bg-white/80 border border-slate-200 text-slate-800"
                              }`}
                            >
                              <span
                                className={`text-[10px] font-extrabold uppercase tracking-wide mr-2 ${
                                  isRep ? "text-purple-700" : "text-emerald-700"
                                }`}
                              >
                                {isRep ? `[${activeEmbeddedCall.repName}]` : `[Customer]`}
                              </span>
                              <span className="font-sans leading-relaxed">
                                {line.replace(/^[^:]+:\s*/, "")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 bg-slate-50/50">
                        {activeEmbeddedCall.missed
                          ? "Prospect did not answer the phone call. No verbal conversation was recorded."
                          : "No verbatim transcript saved for this call."}
                      </div>
                    )}

                    {activeEmbeddedCall.recordingUrl && (
                      <div className="mt-4 flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">🎧</span>
                          <div>
                            <p className="text-xs font-black text-purple-900">Original Audio (Google Drive)</p>
                            <p className="text-[10px] text-purple-700 font-medium">Stored on Client's Drive • 0 Server Storage</p>
                          </div>
                        </div>
                        <a
                          href={activeEmbeddedCall.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition shadow-xs cursor-pointer"
                        >
                          <span>▶</span> Listen to Audio ↗
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Section 4: Action Bar */}
                  <div className="mt-7 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] text-slate-500">
                        Audit Document Verified • Dual Sync Active
                      </span>
                      {activeEmbeddedCall.leadId && (
                        <button
                          type="button"
                          onClick={() => setFollowUpHistoryOpen(true)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800 transition cursor-pointer"
                        >
                          <span>📜</span> Follow-Up History ({followUpHistoryForActiveLead.length})
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={togglingFollowUpId === activeEmbeddedCall.id}
                        onClick={() => handleToggleFollowUp(activeEmbeddedCall)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition cursor-pointer disabled:opacity-50 ${
                          isFollowUpFlagged(activeEmbeddedCall)
                            ? "bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20"
                            : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span>🔔</span>
                        <span>{isFollowUpFlagged(activeEmbeddedCall) ? "Flagged as Follow-Up" : "Flag as Follow-Up"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendAiWhatsAppAlert(activeEmbeddedCall)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-2 text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer"
                      >
                        <span>⚡</span>
                        <span>Send AI WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyEmbeddedDocument(activeEmbeddedCall)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                      >
                        <span>{copiedEmbeddedBrief ? "✓ Copied" : "📋 Copy Brief"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                      >
                        <span>🖨️ Print</span>
                      </button>
                    </div>
                  </div>

                </article>
              ) : (
                <div className="rounded-3xl bg-white p-12 text-center text-slate-400 neo-panel border border-slate-200">
                  Select a call from the left to view the official intelligence brief.
                </div>
              )}
            </div>

          </div>
        </section>
      )}

      {/* Full Executive AI Call Intelligence Document Reader Modal */}
      <CallIntelligenceDocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        calls={filteredCalls.length > 0 ? filteredCalls : callsList}
        initialCallId={activeDocCallId}
        companyName={companyName}
        onSendWhatsApp={(docCall) => {
          const found = callsList.find((c) => c.id === docCall.id);
          if (found) handleSendAiWhatsAppAlert(found);
        }}
      />

      {/* Follow-Up AI Summary History Popup */}
      {followUpHistoryOpen && activeEmbeddedCall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setFollowUpHistoryOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col rounded-3xl bg-white shadow-2xl border border-line"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-sm font-extrabold text-ink">Follow-Up History</h3>
                <p className="text-xs text-ink-muted mt-0.5">{activeEmbeddedCall.targetName}</p>
              </div>
              <button
                type="button"
                onClick={() => setFollowUpHistoryOpen(false)}
                className="text-ink-faint hover:text-ink text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-3">
              {followUpHistoryForActiveLead.length === 0 ? (
                <p className="text-xs text-ink-faint text-center py-8">
                  No calls have been flagged as Follow-Up for this contact yet.
                </p>
              ) : (
                followUpHistoryForActiveLead.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-sky-900">{c.repName}</span>
                      <span className="text-[10px] text-ink-faint">
                        {formatDate(c.occurredAt)} • {formatTime(c.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink leading-relaxed">
                      {c.aiSummary || c.summary || "No AI summary recorded for this call."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function callId(c: CallFeedItem): string {
  return c.id;
}


const localDay = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's timezone

function CallsTodayVsDate({ calls }: { calls: CallFeedItem[] }) {
  const yesterday = new Date(Date.now() - 86400000);
  const [pickedDate, setPickedDate] = useState(localDay(yesterday));

  const stats = (day: string) => {
    const list = calls.filter((c) => localDay(new Date(c.occurredAt)) === day);
    const missed = list.filter((c) => c.missed).length;
    return { total: list.length, missed, answered: list.length - missed };
  };
  const today = stats(localDay(new Date()));
  const picked = stats(pickedDate);
  const max = Math.max(today.total, picked.total, 1);
  const diff = today.total - picked.total;

  const Row = ({ label, s, bar }: { label: string; s: ReturnType<typeof stats>; bar: string }) => (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold text-ink">{label}</span>
        <span className="text-ink-muted">
          <strong className="text-lg font-black text-ink">{s.total}</strong> calls · {s.answered} answered · {s.missed} missed
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${(s.total / max) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl bg-white p-5 neo-panel">
      <div className="-mx-5 -mt-5 mb-1 flex flex-wrap items-center justify-between gap-2 rounded-t-3xl border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-5 py-3.5">
        <h3 className="text-lg font-extrabold tracking-tight text-ink">
          AI calls: today vs <GradientText>another date</GradientText>
        </h3>
        <input
          type="date"
          value={pickedDate}
          max={localDay(new Date())}
          onChange={(e) => e.target.value && setPickedDate(e.target.value)}
          className="h-8 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Date to compare with today"
        />
      </div>
      <div className="mt-4 space-y-4">
        <Row label="Today" s={today} bar="bg-gradient-to-r from-sky-400 to-violet-400" />
        <Row
          label={new Date(`${pickedDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          s={picked}
          bar="bg-gradient-to-r from-violet-300 to-orange-300"
        />
      </div>
      <p className="mt-4 text-xs font-semibold text-ink-muted">
        {diff === 0
          ? "Same number of calls on both days."
          : `Today has ${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} call${Math.abs(diff) === 1 ? "" : "s"} than the other date.`}
      </p>
    </div>
  );
}

const PIE_SLICES = [
  { key: "HOT", label: "🔥 Hot Lead", color: "#fb7185" },
  { key: "WARM", label: "⚡ Warm Lead", color: "#fbbf24" },
  { key: "COLD", label: "❄️ Cold Lead", color: "#7dd3fc" },
  { key: "DEAD", label: "💀 Dead", color: "#cbd5e1" },
] as const;

function LeadQualityPie({ calls }: { calls: CallFeedItem[] }) {
  const counts: Record<string, number> = { HOT: 0, WARM: 0, COLD: 0, DEAD: 0 };
  for (const c of calls) {
    const k = classifyCallLead(c).category;
    counts[k] = (counts[k] || 0) + 1;
  }
  const total = PIE_SLICES.reduce((sum, sl) => sum + (counts[sl.key] || 0), 0);

  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="rounded-3xl bg-white p-5 neo-panel">
      <div className="-mx-5 -mt-5 mb-1 rounded-t-3xl border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-5 py-3.5">
        <h3 className="text-lg font-extrabold tracking-tight text-ink">
          Lead quality from <GradientText>AI calls</GradientText>
        </h3>
      </div>
      {total === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-muted">No calls to classify yet.</p>
      ) : (
        <div className="mt-3 flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Lead quality pie chart">
            {PIE_SLICES.map((sl) => {
              const n = counts[sl.key] || 0;
              if (!n) return null;
              const len = (n / total) * C;
              const el = (
                <circle
                  key={sl.key}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={sl.color}
                  strokeWidth="16"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
            {PIE_SLICES.map((sl) => {
              const n = counts[sl.key] || 0;
              return (
                <li key={sl.key} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: sl.color }} />
                  <span className="truncate font-semibold text-ink">{sl.label}</span>
                  <span className="ml-auto font-bold text-ink">
                    {n} <span className="text-xs font-semibold text-ink-muted">({Math.round((n / total) * 100)}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
