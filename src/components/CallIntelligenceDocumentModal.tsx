"use client";

import { useState, useMemo } from "react";

export interface CallDocumentItem {
  id: string;
  targetName: string;
  targetPhone: string | null;
  direction: string;
  missed: boolean;
  durationSec: number;
  transcript?: string | null;
  aiSummary?: string | null;
  summary?: string | null;
  behaviorTags: string[];
  whatsappSent: boolean;
  occurredAt: string;
  repName?: string | null;
  repPhone?: string | null;
  leadTerritory?: string | null;
  leadDivision?: string | null;
  companyName?: string | null;
}

interface CallIntelligenceDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  calls: CallDocumentItem[];
  initialCallId?: string | null;
  employeeName?: string;
  companyName?: string;
  onSendWhatsApp?: (call: CallDocumentItem) => void;
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

export function CallIntelligenceDocumentModal({
  isOpen,
  onClose,
  calls,
  initialCallId,
  employeeName,
  companyName = "Pharma Life Sciences Pvt Ltd",
  onSendWhatsApp,
}: CallIntelligenceDocumentModalProps) {
  const [selectedCallId, setSelectedCallId] = useState<string>(
    initialCallId || calls[0]?.id || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "ANSWERED" | "MISSED">("ALL");
  const [copiedToast, setCopiedToast] = useState(false);

  // Sync initialCallId if changed
  useMemo(() => {
    if (initialCallId) {
      setSelectedCallId(initialCallId);
    } else if (!selectedCallId && calls.length > 0) {
      setSelectedCallId(calls[0].id);
    }
  }, [initialCallId, calls, selectedCallId]);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (filterType === "ANSWERED" && c.missed) return false;
      if (filterType === "MISSED" && !c.missed) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        c.targetName.toLowerCase().includes(q) ||
        (c.targetPhone && c.targetPhone.includes(q)) ||
        (c.aiSummary && c.aiSummary.toLowerCase().includes(q)) ||
        (c.leadTerritory && c.leadTerritory.toLowerCase().includes(q)) ||
        c.behaviorTags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [calls, filterType, searchQuery]);

  const activeCall = useMemo(() => {
    return calls.find((c) => c.id === selectedCallId) || filteredCalls[0] || calls[0];
  }, [calls, selectedCallId, filteredCalls]);

  if (!isOpen) return null;

  const currentRep = activeCall?.repName || employeeName || "Representative";

  function handleCopyDocument() {
    if (!activeCall) return;
    const cleanPhone = activeCall.targetPhone || "Not specified";
    const text = `=====================================================
ALLOTA AI CALL INTELLIGENCE REPORT [CONFIDENTIAL]
Reference ID: DOC-CALL-${activeCall.id.slice(-8).toUpperCase()}
Company: ${companyName}
Representative: ${currentRep}
Contact Party: ${activeCall.targetName} (${cleanPhone})
Date & Time: ${formatDate(activeCall.occurredAt)} at ${formatTime(activeCall.occurredAt)}
Duration: ${formatDuration(activeCall.durationSec)} (${activeCall.missed ? "MISSED" : "CONNECTED"})
Territory: ${activeCall.leadTerritory || "General"}
=====================================================

[EXECUTIVE SUMMARY]
${activeCall.aiSummary || activeCall.summary || "Call completed without summary."}

[BEHAVIOR & TOPIC TAGS]
${activeCall.behaviorTags.join(", ") || "None"}

[VERBATIM CALL TRANSCRIPT]
${activeCall.transcript || "No audio transcript available."}

Report generated via Gemini 2.5 Flash Telephony Engine.
=====================================================`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    });
  }

  function handlePrint() {
    window.print();
  }

  // Parse transcript lines into speaker bubbles if formatted
  const transcriptLines = activeCall?.transcript
    ? activeCall.transcript.split("\n").filter((l) => l.trim().length > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl border border-slate-300">
        
        {/* Modal Top Action Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-black shadow-md shadow-purple-500/20">
              📄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  AI Call Intelligence Brief & Transcripts
                </h2>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-black text-purple-800 border border-purple-200">
                  Gemini 2.5 Flash
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Audit logs, Hinglish call summaries, and verbatim dialog for <strong className="text-slate-800">{currentRep}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyDocument}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer"
              title="Copy formatted document to clipboard"
            >
              <span>{copiedToast ? "✓ Copied!" : "📋 Copy Brief"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer"
              title="Print document"
            >
              <span>🖨️ Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition font-bold text-sm cursor-pointer ml-2"
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Body (2 Columns: List on Left, Document on Right) */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT COLUMN: All Call Summaries Directory */}
          <aside className="w-80 md:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Call Logs ({filteredCalls.length})
                </h3>
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  {currentRep}
                </span>
              </div>

              {/* Search Bar */}
              <input
                type="text"
                placeholder="Search summaries, parties, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-inner"
              />

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilterType("ALL")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterType === "ALL"
                      ? "bg-purple-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({calls.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType("ANSWERED")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterType === "ANSWERED"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Connected ({calls.filter((c) => !c.missed).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType("MISSED")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterType === "MISSED"
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Missed ({calls.filter((c) => c.missed).length})
                </button>
              </div>
            </div>

            {/* Calls List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {filteredCalls.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No call summaries match your search.
                </div>
              ) : (
                filteredCalls.map((c) => {
                  const isSelected = activeCall?.id === c.id;
                  const isMissed = c.missed;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCallId(c.id)}
                      className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? "bg-purple-50/80 border-2 border-purple-500 shadow-sm"
                          : "hover:bg-slate-50 border-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-xs text-slate-900 truncate">
                            {c.targetName}
                          </h4>
                          <p className="text-[10px] font-mono text-slate-500 truncate">
                            {c.targetPhone || "Direct Call"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 ${
                            isMissed
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {isMissed ? "Missed" : `${formatDuration(c.durationSec)}`}
                        </span>
                      </div>

                      {/* Snippet */}
                      <p className="mt-1.5 line-clamp-2 text-[11px] text-slate-600 leading-snug">
                        {c.aiSummary || c.summary || (isMissed ? "Call not answered." : "Voice recording saved.")}
                      </p>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{formatDate(c.occurredAt)} • {formatTime(c.occurredAt)}</span>
                        {c.leadTerritory && (
                          <span className="font-semibold text-purple-700 truncate max-w-[120px]">
                            📍 {c.leadTerritory}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT COLUMN: The Clean Document Viewer */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/70 flex justify-center">
            {activeCall ? (
              <article className="w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-10 shadow-lg border border-slate-200 relative">
                
                {/* Formal Document Header / Letterhead */}
                <div className="border-b-2 border-slate-900 pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-purple-700">
                        {companyName}
                      </p>
                      <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-0.5">
                        EXECUTIVE CALL INTELLIGENCE BRIEF
                      </h1>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-[10px] font-black tracking-wider uppercase">
                        CONFIDENTIAL
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-500">
                        REF: DOC-CALL-{activeCall.id.slice(-8).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Table Grid */}
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Field Representative
                      </span>
                      <p className="font-extrabold text-slate-900 mt-0.5">
                        {currentRep}
                      </p>
                      {activeCall.repPhone && (
                        <p className="font-mono text-[11px] text-slate-500">{activeCall.repPhone}</p>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Customer / Prospect
                      </span>
                      <p className="font-extrabold text-slate-900 mt-0.5">
                        {activeCall.targetName}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {activeCall.targetPhone || "No Phone Logged"}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Timestamp & Length
                      </span>
                      <p className="font-extrabold text-slate-900 mt-0.5">
                        {formatDate(activeCall.occurredAt)} • {formatTime(activeCall.occurredAt)}
                      </p>
                      <p className="text-[11px] text-slate-600 font-bold">
                        Talk Time: {formatDuration(activeCall.durationSec)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Call Outcome
                      </span>
                      <div className="mt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            activeCall.missed
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {activeCall.missed ? "📵 Unanswered / Missed" : "📞 Connected & Diarized"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Direction: {activeCall.direction}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 1: AI Executive Summary */}
                <div className="mt-7">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-700 text-xs font-black">
                      1
                    </span>
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                      Executive Summary & Commercial Intent
                    </h2>
                  </div>

                  <div className="rounded-2xl border-l-4 border-l-purple-600 bg-purple-50/40 p-5 border border-purple-100">
                    <p className="text-sm text-slate-800 leading-relaxed font-serif whitespace-pre-line">
                      {activeCall.aiSummary || activeCall.summary || (
                        activeCall.missed
                          ? "Outbound voice connection attempt was unanswered by the customer. No discussion recorded."
                          : "Call successfully completed. Audio recording processed and indexed into CRM logs."
                      )}
                    </p>
                  </div>
                </div>

                {/* SECTION 2: Pharma Commercial Intelligence Grid */}
                <div className="mt-7">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">
                      2
                    </span>
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                      PCD Franchise & Molecule Intelligence
                    </h2>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        📍 Exclusive Territory
                      </p>
                      <p className="text-xs font-bold text-slate-800 mt-1">
                        {activeCall.leadTerritory || "General Territory / Direct Prospect"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        🏢 Commercial Division
                      </p>
                      <p className="text-xs font-bold text-slate-800 mt-1">
                        {activeCall.leadDivision === "THIRD_PARTY"
                          ? "Third-Party Contract Manufacturing"
                          : "PCD Pharma Franchise Monopoly"}
                      </p>
                    </div>
                  </div>

                  {/* Behavioral Tags */}
                  {activeCall.behaviorTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400">Key Tags:</span>
                      {activeCall.behaviorTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 3: Verbatim Call Transcript */}
                <div className="mt-7">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">
                        3
                      </span>
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                        Verbatim Audio Transcript (Gemini Multimodal Diarization)
                      </h2>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {transcriptLines.length > 0 ? `${transcriptLines.length} exchanges` : "No dialog"}
                    </span>
                  </div>

                  {transcriptLines.length > 0 ? (
                    <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-xs max-h-80 overflow-y-auto">
                      {transcriptLines.map((line, idx) => {
                        const isEmployee =
                          line.toLowerCase().startsWith("employee:") ||
                          line.toLowerCase().startsWith("representative:") ||
                          line.toLowerCase().startsWith("naresh:") ||
                          line.toLowerCase().startsWith("speaker 1:");

                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl ${
                              isEmployee
                                ? "bg-white border border-purple-100 text-purple-950 font-medium"
                                : "bg-white/80 border border-slate-200 text-slate-800"
                            }`}
                          >
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wide mr-2 ${
                                isEmployee ? "text-purple-700" : "text-emerald-700"
                              }`}
                            >
                              {isEmployee ? `[${currentRep}]` : `[Customer]`}
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
                      {activeCall.missed
                        ? "Prospect did not pick up. No audio dialog was recorded."
                        : activeCall.transcript || "No verbatim transcript saved for this call."}
                    </div>
                  )}
                </div>

                {/* SECTION 4: Follow-up Actions Bar */}
                <div className="mt-8 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    Document indexed in Allota Telephony Repository • Real-Time Dual Sync
                  </div>

                  <div className="flex items-center gap-2">
                    {onSendWhatsApp && (
                      <button
                        type="button"
                        onClick={() => onSendWhatsApp(activeCall)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer"
                      >
                        <span>⚡</span>
                        <span>Send AI WhatsApp Follow-up</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyDocument}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      <span>{copiedToast ? "✓ Copied" : "📋 Copy"}</span>
                    </button>
                  </div>
                </div>

              </article>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                No call selected.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
