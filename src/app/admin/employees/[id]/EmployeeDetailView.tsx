"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  EmployeeDetailData,
  EmployeeLeadRow,
  EmployeeCallRow,
  EmployeeClientRow,
  EmployeeSessionRow,
  EmployeeTaskRow,
} from "./types";
import { markWhatsAppAlertSent } from "@/lib/admin-actions";
import { craftAiWhatsAppMissedMessage } from "@/lib/call-helpers";
import { CallIntelligenceDocumentModal } from "@/components/CallIntelligenceDocumentModal";

function formatINR(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
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

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

type TabType = "leads" | "reassigned" | "attendance" | "calls" | "clients" | "tasks";

export function EmployeeDetailView({
  data,
  initialTab = "leads",
}: {
  data: EmployeeDetailData;
  initialTab?: TabType;
}) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [leadSearch, setLeadSearch] = useState("");
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignFilter, setReassignFilter] = useState<"ALL" | "INCOMING" | "OUTGOING">("ALL");
  const [callSearch, setCallSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [divisionFilter, setDivisionFilter] = useState<"ALL" | "PCD_FRANCHISE" | "THIRD_PARTY">("ALL");

  const { employee, summary } = data;
  const [callsList, setCallsList] = useState<EmployeeCallRow[]>(data.calls);
  const [sendingAlertCallId, setSendingAlertCallId] = useState<string | null>(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [activeDocCallId, setActiveDocCallId] = useState<string | null>(null);

  function handleOpenCallDoc(callId: string) {
    setActiveDocCallId(callId);
    setDocModalOpen(true);
  }

  async function handleSendAiWhatsAppAlert(call: EmployeeCallRow) {
    const rawPhone = call.targetPhone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      alert("No phone number available for this contact party.");
      return;
    }
    const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

    const text = craftAiWhatsAppMissedMessage({
      leadName: call.targetName,
      repName: call.repName || employee.name,
      companyName: call.companyName || "Allota AI",
      division: call.leadDivision,
      territory: call.leadTerritory,
    });

    setSendingAlertCallId(call.id);

    // 1. Open WhatsApp web / mobile intent
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, "_blank");

    // 2. Mark in DB via server action
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

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return data.leads.filter((l) => {
      const matchesSearch =
        !leadSearch.trim() ||
        l.name.toLowerCase().includes(leadSearch.toLowerCase()) ||
        (l.phoneNumber && l.phoneNumber.includes(leadSearch)) ||
        (l.inquiryDetails && l.inquiryDetails.toLowerCase().includes(leadSearch.toLowerCase())) ||
        l.source.toLowerCase().includes(leadSearch.toLowerCase()) ||
        (l.reassignedFrom && l.reassignedFrom.toLowerCase().includes(leadSearch.toLowerCase())) ||
        (l.reassignmentReason && l.reassignmentReason.toLowerCase().includes(leadSearch.toLowerCase()));

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "REASSIGNED" && l.reassignedCount > 0) ||
        (statusFilter === "DEAD" && l.status === "NOT_INTERESTED") ||
        (statusFilter === "CONVERTED" && l.status === "CONVERTED") ||
        (statusFilter === "INTERESTED" && l.status === "INTERESTED") ||
        (statusFilter === "FOLLOWUP" && (l.status === "CONTACTED" || l.status === "ASSIGNED"));

      const matchesDivision =
        divisionFilter === "ALL" || (l.division || "PCD_FRANCHISE") === divisionFilter;

      return matchesSearch && matchesStatus && matchesDivision;
    });
  }, [data.leads, leadSearch, statusFilter, divisionFilter]);

  // Filtered Reassigned Leads
  const filteredReassignments = useMemo(() => {
    return data.reassignments.filter((r) => {
      const matchesSearch =
        !reassignSearch.trim() ||
        r.leadName.toLowerCase().includes(reassignSearch.toLowerCase()) ||
        (r.leadPhone && r.leadPhone.includes(reassignSearch)) ||
        r.otherEmployeeName.toLowerCase().includes(reassignSearch.toLowerCase()) ||
        (r.reason && r.reason.toLowerCase().includes(reassignSearch.toLowerCase())) ||
        r.leadSource.toLowerCase().includes(reassignSearch.toLowerCase());

      const matchesDir =
        reassignFilter === "ALL" || r.direction === reassignFilter;

      return matchesSearch && matchesDir;
    });
  }, [data.reassignments, reassignSearch, reassignFilter]);

  // Filtered Calls
  const filteredCalls = useMemo(() => {
    if (!callSearch.trim()) return callsList;
    const q = callSearch.toLowerCase();
    return callsList.filter(
      (c) =>
        c.targetName.toLowerCase().includes(q) ||
        (c.targetPhone && c.targetPhone.includes(q)) ||
        (c.summary && c.summary.toLowerCase().includes(q)) ||
        (c.aiSummary && c.aiSummary.toLowerCase().includes(q)) ||
        c.behaviorTags.some((t) => t.toLowerCase().includes(q))
    );
  }, [callsList, callSearch]);

  // Filtered Clients
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return data.clients;
    const q = clientSearch.toLowerCase();
    return data.clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phoneNumber && c.phoneNumber.includes(q)) ||
        c.territory.toLowerCase().includes(q) ||
        (c.companyDetails && c.companyDetails.toLowerCase().includes(q))
    );
  }, [data.clients, clientSearch]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return data.tasks;
    const q = taskSearch.toLowerCase();
    return data.tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.taskType.toLowerCase().includes(q)
    );
  }, [data.tasks, taskSearch]);

  return (
    <div className="space-y-8">
      {/* Top Header Card with Employee Profile */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link
                href="/admin/employees"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-primary transition"
              >
                <span>←</span> Back to Representatives List
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black text-2xl shadow-lg shadow-indigo-500/25">
                {employee.name.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-black text-ink">{employee.name}</h1>
                  {employee.isShiftActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active Shift (Logged in {formatTime(employee.currentSessionLogin)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Shift Concluded
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-ink-muted">
                  <span>📱 <strong className="text-ink">{employee.phoneNumber}</strong></span>
                  <span>✉️ {employee.email}</span>
                  <span>📍 Territory: <strong className="text-primary">{employee.territoryName}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Direct Communication Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={`tel:${employee.phoneNumber}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>📞</span> Call Representative
            </a>
            <a
              href={`https://wa.me/${employee.phoneNumber.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white neo-button hover:bg-emerald-700 transition shadow-sm"
            >
              <span>💬</span> WhatsApp Direct
            </a>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2 border-t border-line pt-5 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab("leads")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "leads"
                ? "bg-primary text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>🎯</span> Leads & Conversion Funnel
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "leads" ? "bg-white/20 text-white" : "bg-primary-soft text-primary-strong"
              }`}
            >
              {summary.totalLeads} Leads
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reassigned")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "reassigned"
                ? "bg-amber-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>🔄</span> Reassigned Leads
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "reassigned" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
              }`}
            >
              {data.reassignments.length} Logs
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("attendance")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "attendance"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>⏱️</span> Attendance & Working Hours
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "attendance" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-800"
              }`}
            >
              {summary.avgDailyHours}h / day
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("calls")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "calls"
                ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-500/20"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>🤖</span> AI Calls Summary
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "calls" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"
              }`}
            >
              {summary.totalCalls} Calls
            </span>
          </button>

          {!data.isCorePlan && (
            <button
              type="button"
              onClick={() => setActiveTab("clients")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeTab === "clients"
                  ? "bg-teal-600 text-white shadow-md"
                  : "bg-white text-ink-muted border border-line hover:bg-slate-50"
              }`}
            >
              <span>💼</span> Clients & Marg Sales
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === "clients" ? "bg-white/20 text-white" : "bg-teal-100 text-teal-800"
                }`}
              >
                {formatINR(summary.totalRevenue)}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "tasks"
                ? "bg-purple-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📋</span> Field Tasks Queue
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "tasks" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"
              }`}
            >
              {summary.pendingTasks} Pending
            </span>
          </button>
        </div>
      </section>

      {/* 5 Executive Scorecard KPI Cards (Dynamic for Core Plan vs ERP Plan) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {data.isCorePlan ? (
          <>
            {/* Card 1: Total Leads Assigned */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Assigned Leads</p>
                <span className="rounded bg-primary-soft px-2 py-0.5 text-[9px] font-bold text-primary-strong">
                  {summary.winRate}% Win Rate
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalLeads}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Converted: <strong className="text-emerald-700">{summary.convertedLeads}</strong> • Dead: <strong className="text-rose-700">{summary.deadLeads}</strong></span>
                <span>Reassigned: <strong className="text-amber-700">{summary.reassignedToCount} In / {summary.reassignedFromCount} Out</strong></span>
              </div>
            </div>

            {/* Card 2: PCD Pharma Franchise Leads */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-blue-600 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">PCD Franchise Leads</p>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-800 border border-blue-200">
                  {data.divisionCounts.pcdPct}% Share
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-blue-700">{data.divisionCounts.pcdCount}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Converted: <strong className="text-emerald-700">{data.divisionCounts.pcdConverted} Parties</strong></span>
                <span>In Talks / Active: <strong>{data.divisionCounts.pcdCount - data.divisionCounts.pcdConverted} Inquiries</strong></span>
              </div>
            </div>

            {/* Card 3: Third-Party Manufacturing Leads */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-purple-600 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Third-Party Mfg Leads</p>
                <span className="rounded bg-purple-50 px-2 py-0.5 text-[9px] font-bold text-purple-800 border border-purple-200">
                  {data.divisionCounts.thirdPartyPct}% Share
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-purple-700">{data.divisionCounts.thirdPartyCount}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Converted: <strong className="text-emerald-700">{data.divisionCounts.tpConverted} Contracts</strong></span>
                <span>In Talks / Active: <strong>{data.divisionCounts.thirdPartyCount - data.divisionCounts.tpConverted} Inquiries</strong></span>
              </div>
            </div>

            {/* Card 4: AI Calls Summary */}
            <div
              onClick={() => setActiveTab("calls")}
              className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 bg-white cursor-pointer hover:shadow-md hover:border-rose-300 transition"
              title="Click to view full AI Call Summaries & Insights"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                  <span>🤖</span> AI Calls Summary
                </p>
                <span className="rounded bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                  {summary.missedCalls} Missed
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalCalls}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Avg Duration: <strong>{formatDuration(summary.avgCallDurationSec)}</strong></span>
                <span>WhatsApp Sent: <strong>{summary.whatsappSentCount}</strong></span>
              </div>
              <p className="mt-2 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                View AI Summaries →
              </p>
            </div>

            {/* Card 5: Field Work Hours */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Field Work Hours</p>
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-800">
                  {summary.totalSessionsCount} Shifts
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.avgDailyHours}h <span className="text-xs font-bold text-ink-faint">/ day</span></p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Total Hours Logged: <strong>{summary.totalWorkingHours.toFixed(1)}h</strong></span>
                <span>Attendance Rate: <strong className="text-indigo-700">{summary.attendanceRate}%</strong></span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Card 1: Billed Revenue */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-500 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Billed Marg Sales</p>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                  {summary.totalClients} Clients
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{formatINR(summary.totalRevenue)}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Initial Orders: <strong>{formatINR(summary.initialOrderRevenue)}</strong></span>
                <span>Reorders: <strong>{formatINR(summary.reorderRevenue)}</strong></span>
              </div>
            </div>

            {/* Card 2: Clients (New vs Repeat) */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-teal-500 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Client Accounts</p>
                <span className="rounded bg-teal-50 px-2 py-0.5 text-[9px] font-bold text-teal-800">
                  {summary.newClientsCount} New
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalClients}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>New Clients Made: <strong className="text-teal-700">{summary.newClientsCount}</strong></span>
                <span>Old / Repeat Parties: <strong className="text-ink">{summary.repeatClientsCount}</strong></span>
              </div>
            </div>

            {/* Card 3: Leads & Funnel */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Leads Handled</p>
                <span className="rounded bg-primary-soft px-2 py-0.5 text-[9px] font-bold text-primary-strong">
                  {summary.winRate}% Win
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalLeads}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Converted: <strong className="text-emerald-700">{summary.convertedLeads}</strong> • Dead: <strong className="text-rose-700">{summary.deadLeads}</strong></span>
                <span>Reassigned: <strong className="text-amber-700">{summary.reassignedToCount} In / {summary.reassignedFromCount} Out</strong></span>
              </div>
            </div>

            {/* Card 4: AI Calls Summary */}
            <div
              onClick={() => setActiveTab("calls")}
              className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 bg-white cursor-pointer hover:shadow-md hover:border-rose-300 transition"
              title="Click to view full AI Call Summaries & Insights"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                  <span>🤖</span> AI Calls Summary
                </p>
                <span className="rounded bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                  {summary.missedCalls} Missed
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalCalls}</p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Avg Duration: <strong>{formatDuration(summary.avgCallDurationSec)}</strong></span>
                <span>WhatsApp Sent: <strong>{summary.whatsappSentCount}</strong></span>
              </div>
              <p className="mt-2 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                View AI Summaries →
              </p>
            </div>

            {/* Card 5: Working Hours */}
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Field Work Hours</p>
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-800">
                  {summary.totalSessionsCount} Shifts
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-ink">{summary.avgDailyHours}h <span className="text-xs font-bold text-ink-faint">/ day</span></p>
              <div className="mt-2 text-[11px] text-ink-muted flex flex-col gap-0.5">
                <span>Total Hours Logged: <strong>{summary.totalWorkingHours.toFixed(1)}h</strong></span>
                <span>Tasks Done: <strong>{summary.completedTasks}/{summary.totalTasks} ({summary.taskCompletionRate}%)</strong></span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* TAB 1: LEADS & CONVERSION FUNNEL */}
      {/* ========================================================================= */}
      {activeTab === "leads" && (
        <div className="space-y-8">
          {/* Funnel Stage Breakdown Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Converted */}
            <div
              onClick={() => setStatusFilter("CONVERTED")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-500 transition hover:-translate-y-0.5 ${
                statusFilter === "CONVERTED" ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-emerald-800">✓ Converted Clients</span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {summary.totalLeads > 0 ? Math.round((summary.convertedLeads / summary.totalLeads) * 100) : 0}%
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-emerald-700">{summary.convertedLeads}</p>
              <p className="mt-1 text-xs text-ink-faint">Successfully signed distributor contracts</p>
            </div>

            {/* Interested */}
            <div
              onClick={() => setStatusFilter("INTERESTED")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-purple-500 transition hover:-translate-y-0.5 ${
                statusFilter === "INTERESTED" ? "ring-2 ring-purple-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-purple-800">★ Product Interested</span>
                <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">
                  {summary.totalLeads > 0 ? Math.round((summary.interestedLeads / summary.totalLeads) * 100) : 0}%
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-purple-700">{summary.interestedLeads}</p>
              <p className="mt-1 text-xs text-ink-faint">Visual aids, rate lists & sample kits shared</p>
            </div>

            {/* Follow-up / In Talks */}
            <div
              onClick={() => setStatusFilter("FOLLOWUP")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-blue-500 transition hover:-translate-y-0.5 ${
                statusFilter === "FOLLOWUP" ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-blue-800">💬 In Talks / Follow-up</span>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                  {summary.totalLeads > 0 ? Math.round((summary.followupLeads / summary.totalLeads) * 100) : 0}%
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-blue-700">{summary.followupLeads}</p>
              <p className="mt-1 text-xs text-ink-faint">Discussions underway on credit & territory terms</p>
            </div>

            {/* Dead Leads */}
            <div
              onClick={() => setStatusFilter("DEAD")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 transition hover:-translate-y-0.5 ${
                statusFilter === "DEAD" ? "ring-2 ring-rose-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-rose-800">✕ Dead Leads</span>
                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                  {summary.totalLeads > 0 ? Math.round((summary.deadLeads / summary.totalLeads) * 100) : 0}%
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-rose-700">{summary.deadLeads}</p>
              <p className="mt-1 text-xs text-ink-faint">Marked rejected/unqualified with specific reasons</p>
            </div>
          </div>

          {/* Lead Sources Distribution */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4">
              <h3 className="font-bold text-ink text-base">Inquiry Sources Allocated to {employee.name}</h3>
              <p className="text-xs text-ink-faint mt-0.5">Where this representative&apos;s assigned leads originated from</p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {data.leadSourceCounts.map((sc) => (
                <div key={sc.source} className="rounded-2xl p-3.5 neo-pressed border border-line bg-white/70">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink">{sc.label}</span>
                    <span className="font-black text-primary">{sc.count}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(sc.pct, 8)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-right text-ink-faint">{sc.pct}% of leads</p>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Leads Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-bold text-ink text-base">All Leads Handled by {employee.name}</h3>
                  <Link
                    href={`/admin/leads-reassign?fromEmployeeId=${employee.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary-strong hover:bg-primary/20 transition shadow-sm"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Reassign Leads
                  </Link>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">
                  Showing {filteredLeads.length} leads {statusFilter !== "ALL" ? `(Filter: ${statusFilter})` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Category Division Filters */}
                <div className="flex items-center gap-1.5 border-r border-line pr-2 mr-1">
                  <button
                    type="button"
                    onClick={() => setDivisionFilter("ALL")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      divisionFilter === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-ink-muted hover:bg-slate-200"
                    }`}
                  >
                    All Types ({data.leads.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDivisionFilter("PCD_FRANCHISE")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      divisionFilter === "PCD_FRANCHISE" ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-800 border border-blue-200"
                    }`}
                  >
                    🏢 PCD ({data.divisionCounts.pcdCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDivisionFilter("THIRD_PARTY")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      divisionFilter === "THIRD_PARTY" ? "bg-purple-700 text-white" : "bg-purple-50 text-purple-800 border border-purple-200"
                    }`}
                  >
                    🏭 Third-Party ({data.divisionCounts.thirdPartyCount})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    statusFilter === "ALL" ? "bg-ink text-white" : "bg-white text-ink-muted border border-line"
                  }`}
                >
                  All Statuses
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("CONVERTED")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    statusFilter === "CONVERTED" ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 border border-line"
                  }`}
                >
                  Converted ({summary.convertedLeads})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("INTERESTED")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    statusFilter === "INTERESTED" ? "bg-purple-600 text-white" : "bg-white text-purple-700 border border-line"
                  }`}
                >
                  Interested ({summary.interestedLeads})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("DEAD")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    statusFilter === "DEAD" ? "bg-rose-600 text-white" : "bg-white text-rose-700 border border-line"
                  }`}
                >
                  Dead ({summary.deadLeads})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("REASSIGNED")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    statusFilter === "REASSIGNED" ? "bg-amber-600 text-white shadow-xs" : "bg-white text-amber-700 border border-line hover:bg-amber-50"
                  }`}
                >
                  🔄 Reassigned ({data.leads.filter((l) => l.reassignedCount > 0).length})
                </button>

                <input
                  type="text"
                  placeholder="Search leads..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary w-40"
                />
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Lead / Applicant Name</th>
                    <th className="pb-3">Category</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Source</th>
                    <th className="pb-3">Status Marked by Rep</th>
                    <th className="pb-3">Inquiry Details / Reason Notes</th>
                    <th className="pb-3">Remarks</th>
                    <th className="pb-3 text-right">Assigned Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredLeads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-ink">{l.name}</p>
                          {l.reassignedCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                              <span>🔄</span> Reassigned {l.reassignedFrom ? `from ${l.reassignedFrom}` : ""}
                            </span>
                          )}
                        </div>
                        {l.reassignmentReason && (
                          <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                            Reason: {l.reassignmentReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${
                            l.division === "THIRD_PARTY"
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          }`}
                        >
                          {l.division === "THIRD_PARTY" ? "🏭 Third-Party" : "🏢 PCD Franchise"}
                        </span>
                      </td>
                      <td className="py-3 text-ink-muted">{l.phoneNumber || "—"}</td>
                      <td className="py-3">
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                          {l.source}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            l.status === "CONVERTED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : l.status === "INTERESTED"
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : l.status === "CONTACTED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : l.status === "NOT_INTERESTED"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {l.status === "NOT_INTERESTED" ? "DEAD LEAD" : l.status}
                        </span>
                      </td>
                      <td className="py-3 max-w-md text-ink-muted text-[11px]">
                        {l.inquiryDetails || "Standard franchise inquiry."}
                      </td>
                      <td className="py-3">
                        {l.remarks.length > 0 ? (
                          <details className="group">
                            <summary className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2 cursor-pointer select-none">
                              📝 Remarks ({l.remarks.length})
                            </summary>
                            <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-line-soft bg-slate-50 p-2 max-w-xs">
                              {l.remarks.map((r) => (
                                <div key={r.id} className="text-[11px] leading-relaxed">
                                  <p className="text-ink">{r.remark}</p>
                                  <p className="text-[10px] text-ink-faint font-semibold">
                                    — {r.employeeName}, {new Date(r.createdAt).toLocaleString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <span className="text-ink-faint text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-ink-faint">{formatDate(l.createdAt)}</td>
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-ink-faint">
                        No leads matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REASSIGNED LEADS & DELEGATION AUDIT */}
      {/* ========================================================================= */}
      {activeTab === "reassigned" && (
        <div className="space-y-8">
          {/* Reassigned Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div
              onClick={() => setReassignFilter("INCOMING")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600 transition hover:-translate-y-0.5 ${
                reassignFilter === "INCOMING" ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Inflow (Leads Received)</p>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  📥 Received
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-emerald-700">{summary.reassignedToCount}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Leads reassigned to {employee.name} from colleagues for testing and conversion.
              </p>
            </div>

            <div
              onClick={() => setReassignFilter("OUTGOING")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 transition hover:-translate-y-0.5 ${
                reassignFilter === "OUTGOING" ? "ring-2 ring-rose-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Outflow (Leads Transferred)</p>
                <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                  📤 Transferred Out
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-rose-700">{summary.reassignedFromCount}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Leads taken from {employee.name} and given to other reps due to stagnation or re-testing.
              </p>
            </div>

            <div
              onClick={() => setReassignFilter("ALL")}
              className={`cursor-pointer rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500 transition hover:-translate-y-0.5 ${
                reassignFilter === "ALL" ? "ring-2 ring-amber-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Reassignment Logs</p>
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                  🔄 Total Logs
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-ink">{data.reassignments.length}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Complete audit trail of all lead transfers involving {employee.name}.
              </p>
            </div>
          </div>

          {/* Reassignment Audit Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-bold text-ink text-base">Reassigned Leads History for {employee.name}</h3>
                  <Link
                    href={`/admin/leads-reassign?fromEmployeeId=${employee.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition shadow-sm"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Open Leads Reassign Module →
                  </Link>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">
                  Showing {filteredReassignments.length} transfer logs {reassignFilter !== "ALL" ? `(Filter: ${reassignFilter})` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReassignFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    reassignFilter === "ALL" ? "bg-ink text-white" : "bg-white text-ink-muted border border-line"
                  }`}
                >
                  All ({data.reassignments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReassignFilter("INCOMING")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    reassignFilter === "INCOMING" ? "bg-emerald-600 text-white shadow-xs" : "bg-white text-emerald-700 border border-line hover:bg-emerald-50"
                  }`}
                >
                  📥 Inflow ({summary.reassignedToCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReassignFilter("OUTGOING")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    reassignFilter === "OUTGOING" ? "bg-rose-600 text-white shadow-xs" : "bg-white text-rose-700 border border-line hover:bg-rose-50"
                  }`}
                >
                  📤 Outflow ({summary.reassignedFromCount})
                </button>

                <input
                  type="text"
                  placeholder="Search reassignment logs..."
                  value={reassignSearch}
                  onChange={(e) => setReassignSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-amber-500 w-52"
                />
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Lead / Prospect Name</th>
                    <th className="pb-3">Source Channel</th>
                    <th className="pb-3">Delegation Movement</th>
                    <th className="pb-3">Reassignment Reason</th>
                    <th className="pb-3">Pipeline Status</th>
                    <th className="pb-3 text-right">Reassigned Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredReassignments.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <p className="font-bold text-ink">{log.leadName}</p>
                        <p className="text-[10px] text-ink-faint">{log.leadPhone || "No contact recorded"}</p>
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                          {log.leadSource}
                        </span>
                      </td>
                      <td className="py-3">
                        {log.direction === "INCOMING" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 w-fit">
                              📥 Received from {log.otherEmployeeName}
                            </span>
                            {log.otherEmployeePhone && (
                              <span className="text-[9px] text-ink-faint">{log.otherEmployeePhone}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800 w-fit">
                              📤 Reallocated to {log.otherEmployeeName}
                            </span>
                            {log.otherEmployeePhone && (
                              <span className="text-[9px] text-ink-faint">{log.otherEmployeePhone}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 max-w-sm text-ink-muted text-[11px]">
                        <p className="leading-relaxed font-medium">{log.reason || "Management reassignment for testing/follow-up"}</p>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-ink-faint line-through">
                            {log.previousStatus || "ASSIGNED"}
                          </span>
                          <span className="text-ink-faint">→</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              log.currentStatus === "CONVERTED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : log.currentStatus === "INTERESTED"
                                ? "bg-purple-50 text-purple-800 border-purple-200"
                                : log.currentStatus === "NOT_INTERESTED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                          >
                            {log.currentStatus === "NOT_INTERESTED" ? "DEAD" : log.currentStatus}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-ink-faint">
                        {formatDate(log.reassignedAt)}
                      </td>
                    </tr>
                  ))}
                  {filteredReassignments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-ink-faint">
                        No lead reassignments found for {employee.name} matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ATTENDANCE & WORKING HOURS */}
      {/* ========================================================================= */}
      {activeTab === "attendance" && (
        <div className="space-y-8">
          {/* Attendance KPI Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Average Daily Shift</p>
              <p className="mt-2 text-2xl font-black text-ink">{summary.avgDailyHours} Hours</p>
              <p className="mt-1 text-xs text-ink-muted">Calculated across {summary.totalSessionsCount} recorded shifts</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Field Hours Logged</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">{summary.totalWorkingHours.toFixed(1)} Hours</p>
              <p className="mt-1 text-xs text-ink-muted">Cumulative active duty duration</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Today&apos;s Shift Status</p>
              <p className="mt-2 text-2xl font-black text-primary">
                {employee.isShiftActive ? "🟢 Active Now" : "Shift Completed"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {employee.currentSessionLogin ? `Logged in at ${formatTime(employee.currentSessionLogin)}` : "No active session"}
              </p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-purple-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Attendance Discipline</p>
              <p className="mt-2 text-2xl font-black text-purple-700">
                {summary.totalSessionsCount > 0 ? `${summary.attendanceRate}% On-Time` : "No Shifts Logged"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {summary.totalSessionsCount > 0
                  ? `${summary.onTimeSessionsCount} of ${summary.totalSessionsCount} shifts on schedule`
                  : "Field device biometric / web sync"}
              </p>
            </div>
          </div>

          {/* Attendance Audit Log Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-ink text-base">Login & Logout Shift Log (Last 10 Days)</h3>
                <p className="text-xs text-ink-faint mt-0.5">
                  Exact timestamps, total working hours, IP address, and field device model
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800">
                Audited Log
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Shift Date</th>
                    <th className="pb-3">Login Time</th>
                    <th className="pb-3">Logout Time</th>
                    <th className="pb-3">Total Working Hours</th>
                    <th className="pb-3">Device / Platform</th>
                    <th className="pb-3">Network IP</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">{formatDate(s.loginTime)}</td>
                      <td className="py-3 font-semibold text-emerald-700">{formatTime(s.loginTime)}</td>
                      <td className="py-3 font-semibold text-ink-muted">{s.logoutTime ? formatTime(s.logoutTime) : "—"}</td>
                      <td className="py-3">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-800 border border-indigo-200">
                          {s.workingHours ? `${s.workingHours.toFixed(2)} hrs` : "In Progress"}
                        </span>
                      </td>
                      <td className="py-3 text-[11px] text-ink-faint">{s.deviceInfo || "Android Field Device"}</td>
                      <td className="py-3 text-[11px] font-mono text-ink-faint">{s.ipAddress || "192.168.1.108"}</td>
                      <td className="py-3 text-right">
                        {s.status === "ACTIVE" ? (
                          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold animate-pulse">
                            Active Shift
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold">
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DAILY CALLS & TELEPHONY ACTIVITY */}
      {/* ========================================================================= */}
      {activeTab === "calls" && (
        <div className="space-y-8">
          {/* 1. Daily Calls & Telephony Performance Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Calls Placed</p>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalCalls} Calls</p>
              <p className="mt-1 text-xs text-ink-muted">All voice touchpoints logged</p>
            </div>

            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Picked / Answered</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700">{summary.connectedCalls}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {summary.totalCalls > 0 ? Math.round((summary.connectedCalls / summary.totalCalls) * 100) : 0}% Picked
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Active verbal engagement</p>
            </div>

            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-600 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Not Answered / Missed</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-700">{summary.missedCalls}</span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {summary.totalCalls > 0 ? Math.round((summary.missedCalls / summary.totalCalls) * 100) : 0}% Missed
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Prospect did not pick up</p>
            </div>

            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Average Talk Duration</p>
              <p className="mt-2 text-2xl font-black text-indigo-700">{formatDuration(summary.avgCallDurationSec)}</p>
              <p className="mt-1 text-xs text-ink-muted">Order & visual aid discussion</p>
            </div>

            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-teal-600 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">WhatsApp Dispatches</p>
              <p className="mt-2 text-2xl font-black text-teal-700">{callsList.filter((c) => c.whatsappSent).length} Sent</p>
              <p className="mt-1 text-xs text-ink-muted">AI recovery alerts delivered</p>
            </div>
          </div>

          {/* 2. Priority Missed Call Recovery Queue */}
          {callsList.filter((c) => c.missed && !c.whatsappSent).length > 0 && (
            <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-white border-2 border-amber-300/80 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white text-lg shadow-md shadow-amber-500/25">
                    ⚡
                  </span>
                  <div>
                    <h3 className="font-black text-ink text-base">
                      Missed Call Recovery Desk ({callsList.filter((c) => c.missed && !c.whatsappSent).length} Unanswered Inquiries)
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      These prospects did not answer calls placed by {employee.name}. Send 1-tap personalized AI WhatsApp follow-up messages to prevent lead leakage.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 self-start sm:self-auto border border-amber-300">
                  Action Required
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {callsList
                  .filter((c) => c.missed && !c.whatsappSent)
                  .map((call) => (
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

                        {call.leadTerritory && (
                          <p className="text-[11px] text-ink-faint mt-1.5 flex items-center gap-1">
                            <span>📍</span> {call.leadTerritory}
                            {call.leadDivision && (
                              <span className="text-[10px] font-bold text-purple-700">
                                • {call.leadDivision === "THIRD_PARTY" ? "Third-Party" : "PCD Franchise"}
                              </span>
                            )}
                          </p>
                        )}

                        <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5 border border-line text-[11px] text-ink-muted italic">
                          &ldquo;Hello {call.targetName}, this is {employee.name} from {call.companyName || "our company"}. We just tried calling you regarding your franchise inquiry...&rdquo;
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-2">
                        <span className="text-[10px] text-ink-faint font-medium">
                          {formatTime(call.occurredAt)} • {formatDate(call.occurredAt)}
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
                  ))}
              </div>
            </div>
          )}

          {/* 3. Daily Call Trend (Day-by-Day) */}
          <div className="rounded-3xl p-6 neo-panel bg-white">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-ink text-base">Daily Calling Volume & Connection Velocity (Last 7 Days)</h3>
                <p className="text-xs text-ink-faint mt-0.5">Calls placed and answered per day by {employee.name}</p>
              </div>
              <span className="text-xs font-semibold text-ink-muted">
                Last 7 Days: <strong className="text-ink">{summary.totalCalls} total calls</strong>
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.dailyCallStats.map((st) => (
                <div key={st.dateLabel} className="rounded-2xl p-4 neo-pressed border border-line bg-white/70">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink">{st.dateLabel}</span>
                    <span className="text-xs font-black text-rose-600">{st.total} Calls</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
                    <span>Connected: <strong className="text-emerald-700">{st.connected}</strong></span>
                    <span>Missed: <strong className="text-amber-700">{st.missed}</strong></span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${st.total > 0 ? (st.connected / st.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-right font-bold text-ink-faint">
                    {st.total > 0 ? Math.round((st.connected / st.total) * 100) : 0}% Connection Rate
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Detailed AI Call Intelligence History & Audio Summaries */}
          <div className="rounded-3xl p-6 neo-panel bg-white">
            <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-black text-purple-700">
                    <span>✨</span> AI Telephony Insights
                  </span>
                  <span className="text-xs text-ink-faint">Admin Executive Audit</span>
                </div>
                <h3 className="font-extrabold text-ink text-lg mt-1">Call Logs & AI Summaries</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Executive summaries, prospect intent, behavioral tags, and WhatsApp recovery status for all calls placed by {employee.name}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="Search contact, notes, tags..."
                  value={callSearch}
                  onChange={(e) => setCallSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 w-64 shadow-xs"
                />

                <button
                  type="button"
                  onClick={() => handleOpenCallDoc(filteredCalls[0]?.id || callsList[0]?.id)}
                  disabled={callsList.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 hover:scale-105 active:scale-95 text-white px-4 py-2 text-xs font-black shadow-md shadow-purple-600/25 transition-all duration-200 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <span>📄</span>
                  <span>Browse AI Call Documents ({filteredCalls.length})</span>
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {filteredCalls.map((c) => {
                const isMissed = c.missed;
                const cleanPhone = (c.targetPhone || "").replace(/\D/g, "");

                return (
                  <div
                    key={c.id}
                    className={`rounded-2xl p-5 border transition-all duration-200 ${
                      isMissed
                        ? "border-amber-200/80 bg-amber-50/20 hover:bg-amber-50/40"
                        : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      {/* Left: Contact Info & Call Status */}
                      <div className="space-y-1.5 min-w-[220px]">
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

                      {/* Middle: AI Call Summary & Key Takeaways (Clickable Document Trigger) */}
                      <div
                        onClick={() => handleOpenCallDoc(c.id)}
                        className="flex-1 rounded-2xl p-4 bg-slate-50/80 border border-line hover:bg-purple-50/50 hover:border-purple-400 hover:shadow-md hover:scale-[1.015] active:scale-[0.99] transition-all duration-200 cursor-pointer group/doc"
                        title="Click to view full AI Intelligence Document & Verbatim Transcript"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">🤖</span>
                            <span className="text-[11px] font-black uppercase tracking-wider text-purple-800">
                              AI Call Summary & Insights
                            </span>
                            <span className="text-[10px] text-purple-700 bg-purple-100 group-hover/doc:bg-purple-600 group-hover/doc:text-white px-2 py-0.5 rounded-full font-bold transition-all duration-200 shadow-2xs flex items-center gap-1">
                              <span>📄</span> Click to Open Brief ↗
                            </span>
                          </div>
                          <span className="text-[10px] text-ink-faint">
                            {formatDate(c.occurredAt)} at {formatTime(c.occurredAt)}
                          </span>
                        </div>

                        <p className="text-xs text-ink leading-relaxed whitespace-pre-line group-hover/doc:text-slate-900">
                          {c.aiSummary || c.summary || (isMissed ? "Outbound attempt unanswered. Recommend instant follow-up via WhatsApp." : "Routine follow-up conversation recorded.")}
                        </p>

                        {/* Behavioral Tags */}
                        {c.behaviorTags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-line/60">
                            {c.behaviorTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-lg bg-white border border-line px-2 py-0.5 text-[10px] font-bold text-ink-muted shadow-2xs group-hover/doc:border-purple-200"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between">
                          <span className="text-[11px] text-purple-700 font-extrabold group-hover/doc:text-purple-900 flex items-center gap-1.5">
                            <span>📑</span> Read Verbatim Transcript & AI Audit Document &rarr;
                          </span>
                          <span className="text-[10px] text-slate-400 group-hover/doc:text-purple-600 font-bold">
                            Interactive Document Reader
                          </span>
                        </div>
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
                              disabled={sendingAlertCallId === c.id}
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

                        <span className="text-[10px] text-ink-faint">
                          Rep: {c.repName || employee.name}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredCalls.length === 0 && (
                <div className="rounded-2xl p-10 text-center neo-panel bg-slate-50 border border-line">
                  <p className="text-sm font-bold text-ink">No calls matching &ldquo;{callSearch}&rdquo;</p>
                  <p className="text-xs text-ink-muted mt-1">Try searching by lead name, phone number, or discussion tags.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CLIENTS & MARG SALES */}
      {/* ========================================================================= */}
      {activeTab === "clients" && (
        <div className="space-y-8">
          {/* Sales Breakdown Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Sales Generated</p>
              <p className="mt-2 text-2xl font-black text-ink">{formatINR(summary.totalRevenue)}</p>
              <p className="mt-1 text-xs text-ink-muted">Marg ERP 9+ billed invoice turnover</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Initial Orders from New Clients</p>
              <p className="mt-2 text-2xl font-black text-primary">{formatINR(summary.initialOrderRevenue)}</p>
              <p className="mt-1 text-xs text-ink-muted">{summary.newClientsCount} new distributors onboarded</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Reorders Volume (Retention)</p>
              <p className="mt-2 text-2xl font-black text-indigo-700">{formatINR(summary.reorderRevenue)}</p>
              <p className="mt-1 text-xs text-ink-muted">{summary.repeatClientsCount} repeat customer parties</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Outstanding Credit Balance</p>
              <p className="mt-2 text-2xl font-black text-rose-700">{formatINR(summary.totalOutstandingCredit)}</p>
              <p className="mt-1 text-xs text-ink-muted">Payment recovery responsibility</p>
            </div>
          </div>

          {/* Clients Assigned Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Client Accounts Managed by {employee.name}</h3>
                <p className="text-xs text-ink-faint mt-0.5">Tracking new client acquisition vs repeat order retention and credit ledger</p>
              </div>

              <input
                type="text"
                placeholder="Search clients..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-teal-600 w-56"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Client Company Name</th>
                    <th className="pb-3">Territory Area</th>
                    <th className="pb-3">Account Type</th>
                    <th className="pb-3">Reorder Cadence</th>
                    <th className="pb-3">Dispatched Orders</th>
                    <th className="pb-3">Credit Balance</th>
                    <th className="pb-3 text-right">Total Marg Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">
                        {c.name}
                        <p className="text-[10px] text-ink-faint font-normal">{c.companyDetails || "—"}</p>
                      </td>
                      <td className="py-3 font-semibold text-primary">{c.territory}</td>
                      <td className="py-3">
                        {c.isNewClient ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                            ★ New Client
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                            Repeat Customer
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-ink-muted font-medium">{c.cadence}</td>
                      <td className="py-3 font-semibold text-ink">{c.ordersCount} Invoices</td>
                      <td className="py-3">
                        {c.creditBalance > 0 ? (
                          <span className="font-bold text-rose-700">{formatINR(c.creditBalance)}</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">Settled</span>
                        )}
                      </td>
                      <td className="py-3 text-right font-black text-ink">{formatINR(c.totalSpent)}</td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-faint">
                        No clients matching &ldquo;{clientSearch}&rdquo;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FIELD TASKS QUEUE */}
      {/* ========================================================================= */}
      {activeTab === "tasks" && (
        <div className="space-y-8">
          {/* Tasks KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-purple-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Tasks Assigned</p>
              <p className="mt-2 text-2xl font-black text-ink">{summary.totalTasks} Tasks</p>
              <p className="mt-1 text-xs text-ink-muted">Delegated by management</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Completed Tasks</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">{summary.completedTasks} Done</p>
              <p className="mt-1 text-xs text-ink-muted">{summary.taskCompletionRate}% Execution rate</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Pending Field Actions</p>
              <p className="mt-2 text-2xl font-black text-amber-700">{summary.pendingTasks} Pending</p>
              <p className="mt-1 text-xs text-ink-muted">In representative work queue</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Performance Grade</p>
              <p className="mt-2 text-2xl font-black text-primary">A+ Field Rating</p>
              <p className="mt-1 text-xs text-ink-muted">High task turnaround discipline</p>
            </div>
          </div>

          {/* Detailed Tasks Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Active Field Tasks for {employee.name}</h3>
                <p className="text-xs text-ink-faint mt-0.5">Tasks delegated by management for client reorders, credit recovery, and sample deliveries</p>
              </div>

              <input
                type="text"
                placeholder="Search tasks..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-purple-600 w-56"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Task Title & Details</th>
                    <th className="pb-3">Client / Party</th>
                    <th className="pb-3">Task Type</th>
                    <th className="pb-3">Priority</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Target Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="py-3 max-w-md">
                        <p className="font-bold text-ink">{t.title}</p>
                        <p className="text-[10px] text-ink-faint">{t.description || "—"}</p>
                      </td>
                      <td className="py-3 font-semibold text-primary">{t.clientName}</td>
                      <td className="py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                          {t.taskType.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            t.priority === "URGENT"
                              ? "bg-rose-100 text-rose-800"
                              : t.priority === "HIGH"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            t.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : t.status === "IN_PROGRESS"
                              ? "bg-sky-50 text-sky-800 border border-sky-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-ink-faint">{formatDate(t.dueDate)}</td>
                    </tr>
                  ))}
                  {filteredTasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-ink-faint">
                        No tasks matching &ldquo;{taskSearch}&rdquo;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Full Executive AI Call Intelligence Document Reader Modal */}
      <CallIntelligenceDocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        calls={callsList}
        initialCallId={activeDocCallId}
        employeeName={employee.name}
        companyName="Allota AI"
        onSendWhatsApp={(call) => {
          const found = callsList.find((c) => c.id === call.id);
          if (found) handleSendAiWhatsAppAlert(found);
        }}
      />
    </div>
  );
}
