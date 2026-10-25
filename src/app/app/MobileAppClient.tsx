"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export interface MobileLeadItem {
  id: string;
  name: string;
  phoneNumber?: string | null;
  city?: string | null;
  state?: string | null;
  source: string;
  sourceTag?: string | null;
  status: string;
  sentiment?: string | null;
  inquiryDetails?: string | null;
  createdAt: string;
}

export interface MobileCallItem {
  id: string;
  contactName?: string | null;
  contactPhone?: string | null;
  employeeName?: string | null;
  durationSec: number;
  missed: boolean;
  recordingUrl?: string | null;
  transcript?: string | null;
  aiSummary?: string | null;
  behaviorTags: string[];
  sentiment?: string | null;
  occurredAt: string;
}

export function MobileAppClient({
  companyName = "Kesrox",
  initialLeads = [],
  initialCalls = [],
}: {
  companyName?: string;
  initialLeads: MobileLeadItem[];
  initialCalls: MobileCallItem[];
}) {
  const [activeTab, setActiveTab] = useState<"LEADS" | "CALLS" | "FOLLOWUPS">("LEADS");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"ALL" | "HOT" | "META" | "WON">("ALL");
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  // 1-Tap WhatsApp Action
  const handleOpenWhatsApp = (lead: MobileLeadItem) => {
    const raw = lead.phoneNumber || "";
    const cleanDigits = raw.replace(/\D/g, "");
    const phoneWithCountry =
      cleanDigits.startsWith("91") && cleanDigits.length === 12
        ? cleanDigits
        : cleanDigits.length === 10
        ? `91${cleanDigits}`
        : cleanDigits;

    const message = `Namaste ${lead.name || "Sir"}, this is from ${companyName} regarding your inquiry for PCD Pharma franchise and product catalogue. How can we help you today?`;
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // 1-Tap Call Action
  const handleCall = (phone?: string | null) => {
    const clean = (phone || "").replace(/\D/g, "");
    if (clean) {
      window.location.href = `tel:${clean}`;
    }
  };

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return initialLeads.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (item.name || "").toLowerCase().includes(q) ||
        (item.phoneNumber || "").toLowerCase().includes(q) ||
        (item.city || "").toLowerCase().includes(q) ||
        (item.inquiryDetails || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (selectedFilter === "HOT") {
        return (
          item.sentiment === "HOT" ||
          (item.inquiryDetails || "").toLowerCase().includes("hot")
        );
      }
      if (selectedFilter === "META") {
        return (
          (item.sourceTag || "").toLowerCase().includes("meta") ||
          (item.source || "").toLowerCase().includes("meta")
        );
      }
      if (selectedFilter === "WON") {
        return item.status === "WON";
      }

      return true;
    });
  }, [initialLeads, searchQuery, selectedFilter]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-between max-w-md mx-auto shadow-2xl border-x border-[#E2E8F0]">
      {/* ============================================================ */}
      {/* 1. TOP HEADER (BRAND + 1-TAP OPEN IN CHROME)                 */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0369A1] flex items-center justify-center text-white font-black text-sm shadow-sm shadow-[#0284C7]/25">
            {(companyName[0] || "A").toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-[#0F172A] tracking-tight">
                {companyName}
              </span>
              <span className="h-2 w-2 rounded-full bg-[#059669] animate-pulse" />
            </div>
            <p className="text-[10px] font-semibold text-[#64748B]">Allota Mobile Desk</p>
          </div>
        </div>

        {/* The Requested Button: Redirect to Chrome for Full Features */}
        <Link
          href="/admin"
          className="flex items-center gap-1.5 bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] px-2.5 py-1.5 rounded-xl border border-[#BAE6FD] text-[11px] font-bold transition active:scale-95"
        >
          <span>🌐</span>
          <span>Open Full CRM</span>
        </Link>
      </header>

      {/* ============================================================ */}
      {/* 2. MAIN BODY                                                 */}
      {/* ============================================================ */}
      <main className="flex-1 p-3.5 pb-24 overflow-y-auto space-y-3">
        {/* TAB 1: LEAD CENTER */}
        {activeTab === "LEADS" && (
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[#64748B] text-xs">🔍</span>
              <input
                type="text"
                placeholder="Search leads, phone, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E2E8F0] rounded-xl pl-8 pr-3 py-2 text-xs text-[#0F172A] placeholder-[#64748B] focus:outline-[#0284C7] shadow-xs"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: "ALL", label: "All Leads" },
                { id: "HOT", label: "🔥 Hot Leads" },
                { id: "META", label: "⚡ Meta Ads" },
                { id: "WON", label: "✓ Won" },
              ].map((tab) => {
                const isSelected = selectedFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                      isSelected
                        ? "bg-[#0F172A] text-white shadow-xs"
                        : "bg-white text-[#334155] border border-[#E2E8F0] hover:bg-[#F1F5F9]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Lead Cards List */}
            {filteredLeads.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center neo-panel">
                <span className="text-3xl block mb-2">💬</span>
                <p className="font-extrabold text-xs text-[#0F172A]">No leads found</p>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Incoming Meta Ads and WhatsApp leads will arrive here live.
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isHot =
                  lead.sentiment === "HOT" ||
                  (lead.inquiryDetails || "").toLowerCase().includes("hot");
                const isMeta =
                  (lead.sourceTag || "").toLowerCase().includes("meta") ||
                  (lead.source || "").toLowerCase().includes("meta");

                return (
                  <div
                    key={lead.id}
                    className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm space-y-3 neo-panel transition hover:border-[#0284C7]/40"
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-extrabold text-sm text-[#0F172A] truncate">
                          {lead.name || "WhatsApp Prospect"}
                        </p>
                        <p className="text-[11px] font-semibold text-[#64748B] font-mono mt-0.5">
                          {lead.phoneNumber || "–"}
                        </p>
                      </div>

                      {/* Badge */}
                      {isHot ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                          🔥 Hot Lead
                        </span>
                      ) : isMeta ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#CCFBF1] border border-[#99F6E4] text-[#0D9488]">
                          ⚡ Meta Ad
                        </span>
                      ) : (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155]">
                          {lead.status || "NEW"}
                        </span>
                      )}
                    </div>

                    {/* Location */}
                    {(lead.city || lead.state) && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-[#64748B]">
                        <span>📍</span>
                        <span>{[lead.city, lead.state].filter(Boolean).join(", ")}</span>
                      </div>
                    )}

                    {/* Inquiry Text */}
                    {lead.inquiryDetails && (
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5 text-xs text-[#334155] leading-relaxed">
                        "{lead.inquiryDetails}"
                      </div>
                    )}

                    {/* Bottom Actions: 1-Tap WhatsApp & 1-Tap Call */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]/70">
                      <button
                        onClick={() => handleOpenWhatsApp(lead)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white py-2.5 px-3 rounded-xl text-xs font-extrabold shadow-sm shadow-[#25D366]/20 transition active:scale-95 cursor-pointer"
                      >
                        <span className="text-sm">💬</span>
                        <span>WhatsApp</span>
                      </button>

                      <button
                        onClick={() => handleCall(lead.phoneNumber)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] py-2.5 px-3 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
                      >
                        <span className="text-sm">📞</span>
                        <span>Call</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: AI CALLS SUMMARY */}
        {activeTab === "CALLS" && (
          <div className="space-y-3">
            <div className="bg-gradient-to-r from-[#0284C7] to-[#0369A1] rounded-2xl p-4 text-white shadow-md">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎙️</span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#BAE6FD]">
                  AI Call Intelligence Desk
                </span>
              </div>
              <h2 className="text-base font-black mt-1">Hinglish Call Briefs</h2>
              <p className="text-[11px] text-[#E0F2FE] mt-0.5">
                Transcribed from call recordings with commercial buying intent tags.
              </p>
            </div>

            {initialCalls.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center neo-panel">
                <span className="text-3xl block mb-2">📞</span>
                <p className="font-extrabold text-xs text-[#0F172A]">No call recordings yet</p>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Synced call recordings will be analyzed by AI and appear here.
                </p>
              </div>
            ) : (
              initialCalls.map((call) => {
                const isExpanded = expandedCallId === call.id;
                const minutes = Math.floor((call.durationSec || 0) / 60);
                const seconds = (call.durationSec || 0) % 60;
                const isHot =
                  call.sentiment === "HOT" ||
                  (call.behaviorTags || []).some((t) => t.includes("Hot") || t.includes("🔥"));

                return (
                  <div
                    key={call.id}
                    className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm space-y-3 neo-panel"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-extrabold text-sm text-[#0F172A]">
                          {call.contactName || "Prospect Inquiry"}
                        </p>
                        <p className="text-[11px] font-mono text-[#64748B] mt-0.5">
                          {call.contactPhone || "–"}
                        </p>
                      </div>

                      {isHot ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                          🔥 Hot Lead
                        </span>
                      ) : (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155]">
                          {call.sentiment || "NEUTRAL"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#64748B] font-semibold">
                      <span>Rep: {call.employeeName || "Executive"}</span>
                      <span>•</span>
                      <span>
                        {minutes}m {seconds}s
                      </span>
                    </div>

                    {/* Hinglish AI Executive Brief */}
                    <div className="bg-[#0D9488]/5 border border-[#0D9488]/20 rounded-xl p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#0D9488] mb-1 flex items-center gap-1">
                        <span>💡</span> AI Executive Summary
                      </p>
                      <p className="text-xs text-[#334155] leading-relaxed font-medium">
                        {call.aiSummary || "Call recorded and analyzed via Allota AI."}
                      </p>
                    </div>

                    {/* Audio Player Link */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]/70 text-xs">
                      {call.recordingUrl ? (
                        <a
                          href={call.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-[#CCFBF1] text-[#0D9488] px-3 py-1.5 rounded-xl font-extrabold active:scale-95 transition"
                        >
                          <span>▶️</span>
                          <span>Listen Audio</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-[#64748B]">No audio URL</span>
                      )}

                      {call.transcript && (
                        <button
                          onClick={() =>
                            setExpandedCallId(isExpanded ? null : call.id)
                          }
                          className="font-bold text-[#0284C7] text-xs cursor-pointer"
                        >
                          {isExpanded ? "Hide Transcript ▲" : "View Dialogue ▼"}
                        </button>
                      )}
                    </div>

                    {/* Transcript Dialogue */}
                    {isExpanded && call.transcript && (
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-[11px] font-mono text-[#334155] max-h-48 overflow-y-auto space-y-1">
                        {call.transcript.split("\n").map((line, i) => (
                          <p
                            key={i}
                            className={
                              line.startsWith("Employee:") || line.startsWith("Sales:")
                                ? "text-[#0D9488] font-bold"
                                : "text-[#0F172A]"
                            }
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: FOLLOW UPS */}
        {activeTab === "FOLLOWUPS" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 neo-panel">
              <h2 className="text-sm font-extrabold text-[#0F172A]">Daily Callback Desk</h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Ensure zero leads slip through by following up on scheduled commitments.
              </p>
            </div>

            {/* Callback Card */}
            <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm space-y-3 neo-panel">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-extrabold text-sm text-[#0F172A]">Dr. Sandeep Verma</p>
                  <p className="text-[11px] font-mono text-[#64748B]">+91 98123 45678</p>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309]">
                  ⚡ Urgent Callback
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#0284C7] font-bold">
                <span>⏰</span>
                <span>Scheduled: Today at 03:30 PM</span>
              </div>

              <p className="text-xs text-[#334155] leading-relaxed">
                "Requested PCD franchise rate list for pediatric syrup range and monopoly terms."
              </p>

              <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]/70">
                <button
                  onClick={() =>
                    window.open(
                      `https://wa.me/919812345678?text=${encodeURIComponent(
                        "Namaste Dr. Sandeep Verma, following up on our scheduled discussion regarding Kesrox PCD franchise."
                      )}`,
                      "_blank"
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] text-white py-2 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer"
                >
                  <span>💬</span>
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={() => (window.location.href = "tel:9812345678")}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-white text-[#0F172A] border border-[#E2E8F0] py-2 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer"
                >
                  <span>📞</span>
                  <span>Call</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* 3. BOTTOM APP NAVIGATION BAR (3 TABS)                        */}
      {/* ============================================================ */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] py-2 px-3 flex items-center justify-around shadow-lg z-30">
        <button
          onClick={() => setActiveTab("LEADS")}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition cursor-pointer ${
            activeTab === "LEADS"
              ? "text-[#0284C7] font-extrabold bg-[#E0F2FE]/60"
              : "text-[#64748B] font-semibold hover:text-[#0F172A]"
          }`}
        >
          <span className="text-base">📋</span>
          <span className="text-[10px]">Lead Center</span>
        </button>

        <button
          onClick={() => setActiveTab("CALLS")}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition cursor-pointer ${
            activeTab === "CALLS"
              ? "text-[#0284C7] font-extrabold bg-[#E0F2FE]/60"
              : "text-[#64748B] font-semibold hover:text-[#0F172A]"
          }`}
        >
          <span className="text-base">📞</span>
          <span className="text-[10px]">AI Calls</span>
        </button>

        <button
          onClick={() => setActiveTab("FOLLOWUPS")}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition cursor-pointer ${
            activeTab === "FOLLOWUPS"
              ? "text-[#0284C7] font-extrabold bg-[#E0F2FE]/60"
              : "text-[#64748B] font-semibold hover:text-[#0F172A]"
          }`}
        >
          <span className="text-base">⏰</span>
          <span className="text-[10px]">Follow Ups</span>
        </button>
      </nav>
    </div>
  );
}
