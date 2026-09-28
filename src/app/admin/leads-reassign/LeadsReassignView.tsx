"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LeadsReassignData,
  ReassignLeadRow,
  EmployeeOption,
  ReassignmentAuditRow,
} from "./types";
import { GradientText } from "@/components/GradientText";

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
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

// Local (not UTC) YYYY-MM-DD, to match an <input type="date"> value
function toLocalDayString(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

const LEADS_PER_PAGE = 10;

export function LeadsReassignView({
  data,
  initialFromEmpId = "ALL",
  initialStatus = "ALL",
}: {
  data: LeadsReassignData;
  initialFromEmpId?: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"direct" | "audit">("direct");

  const { summary, employees, auditLogs } = data;

  // Step 1: Current Assigned Employee Filter
  const [sourceEmpId, setSourceEmpId] = useState<string>(initialFromEmpId || "ALL");

  // Status & channel filters
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || "ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Step 2: Target Employee(s) Selection (multi-select dropdown)
  // Starts completely empty (no auto-selection), admin chooses 1, 2, 3 or all!
  const [targetEmpIds, setTargetEmpIds] = useState<string[]>([]);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 3: Selection & Execution
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [reassignReason, setReassignReason] = useState<string>(
    "Reassigned for performance conversion testing"
  );
  const [resetStatus, setResetStatus] = useState<string>("ASSIGNED");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTargetDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute leads belonging to the selected source employee (or all)
  const sourceLeads = useMemo(() => {
    return data.leads.filter((l) => {
      if (sourceEmpId === "ALL") return true;
      if (sourceEmpId === "UNASSIGNED") return !l.assignedEmployeeId;
      return l.assignedEmployeeId === sourceEmpId;
    });
  }, [data.leads, sourceEmpId]);

  // Compute dynamic status counts directly from current source data
  const statusCounts = useMemo(() => {
    return {
      ALL: sourceLeads.length,
      STAGNANT: sourceLeads.filter(
        (l) => l.status !== "CONVERTED" && l.callsLoggedCount === 0
      ).length,
      NEW: sourceLeads.filter((l) => l.status === "NEW").length,
      CONTACTED: sourceLeads.filter((l) => l.status === "CONTACTED").length,
      INTERESTED: sourceLeads.filter((l) => l.status === "INTERESTED").length,
      DEAD: sourceLeads.filter((l) => l.status === "NOT_INTERESTED").length,
      CONVERTED: sourceLeads.filter((l) => l.status === "CONVERTED").length,
    };
  }, [sourceLeads]);

  // Filter leads based on source, status, channel, and search query
  const [page, setPage] = useState(1);

  const filteredLeads = useMemo(() => {
    return sourceLeads.filter((lead) => {
      // Status filter
      if (statusFilter === "STAGNANT") {
        if (lead.status === "CONVERTED" || lead.callsLoggedCount > 0) {
          return false;
        }
      } else if (statusFilter === "DEAD") {
        if (lead.status !== "NOT_INTERESTED") return false;
      } else if (statusFilter === "NEW") {
        if (lead.status !== "NEW") return false;
      } else if (statusFilter === "CONTACTED") {
        if (lead.status !== "CONTACTED") return false;
      } else if (statusFilter === "INTERESTED") {
        if (lead.status !== "INTERESTED") return false;
      } else if (statusFilter === "CONVERTED") {
        if (lead.status !== "CONVERTED") return false;
      } else if (statusFilter !== "ALL" && lead.status !== statusFilter) {
        return false;
      }

      // Channel / source filter
      if (sourceFilter !== "ALL" && lead.source !== sourceFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          lead.name.toLowerCase().includes(q) ||
          (lead.phoneNumber && lead.phoneNumber.includes(q)) ||
          lead.assignedEmployeeName.toLowerCase().includes(q) ||
          (lead.inquiryDetails && lead.inquiryDetails.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [sourceLeads, statusFilter, sourceFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * LEADS_PER_PAGE,
    currentPage * LEADS_PER_PAGE
  );

  // Back to page 1 whenever the filters change
  useEffect(() => {
    setPage(1);
  }, [sourceEmpId, statusFilter, sourceFilter, searchQuery]);

  // Audit Trail State & Filtering & Pagination
  const AUDIT_PER_PAGE = 10;
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [auditRepFilter, setAuditRepFilter] = useState<string>("ALL");
  const [auditDateFilter, setAuditDateFilter] = useState<string>("");

  const auditRepOptions = useMemo(() => {
    const names = new Set<string>();
    employees.forEach((emp) => {
      if (emp.name) names.add(emp.name);
    });
    auditLogs.forEach((log) => {
      if (log.fromEmployeeName) names.add(log.fromEmployeeName);
      if (log.toEmployeeName) names.add(log.toEmployeeName);
    });
    return Array.from(names).sort();
  }, [employees, auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (auditRepFilter !== "ALL") {
        if (log.fromEmployeeName !== auditRepFilter && log.toEmployeeName !== auditRepFilter) {
          return false;
        }
      }
      if (auditDateFilter) {
        if (toLocalDayString(log.reassignedAt) !== auditDateFilter) {
          return false;
        }
      }
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        const matchLead = log.leadName?.toLowerCase().includes(q);
        const matchPhone = log.leadPhone?.toLowerCase().includes(q);
        const matchFrom = log.fromEmployeeName?.toLowerCase().includes(q);
        const matchTo = log.toEmployeeName?.toLowerCase().includes(q);
        const matchReason = log.reason?.toLowerCase().includes(q);
        if (!matchLead && !matchPhone && !matchFrom && !matchTo && !matchReason) {
          return false;
        }
      }
      return true;
    });
  }, [auditLogs, auditRepFilter, auditDateFilter, auditSearch]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_PER_PAGE));
  const currentAuditPage = Math.min(auditPage, totalAuditPages);
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (currentAuditPage - 1) * AUDIT_PER_PAGE,
    currentAuditPage * AUDIT_PER_PAGE
  );

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch, auditRepFilter, auditDateFilter]);

  // When source or filter changes, default to empty or keep valid selections
  useEffect(() => {
    setSelectedLeadIds((prev) =>
      prev.filter((id) => filteredLeads.some((l) => l.id === id))
    );
  }, [sourceEmpId, statusFilter, sourceFilter]);

  // Available target employees (excluding current source employee)
  const availableTargetEmployees = useMemo(() => {
    return employees.filter((e) => e.id !== sourceEmpId);
  }, [employees, sourceEmpId]);

  // When source changes, clean up any target that matches the new source
  useEffect(() => {
    if (targetEmpIds.includes(sourceEmpId)) {
      setTargetEmpIds((prev) => prev.filter((id) => id !== sourceEmpId));
    }
  }, [sourceEmpId, targetEmpIds]);

  // Toggle target employee in multi-select
  const toggleTargetEmployee = (empId: string) => {
    if (targetEmpIds.includes(empId)) {
      setTargetEmpIds(targetEmpIds.filter((id) => id !== empId));
    } else {
      setTargetEmpIds([...targetEmpIds, empId]);
    }
  };

  // Selection helpers for leads
  const allFilteredSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedLeadIds.includes(l.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter((item) => item !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  // Current Source Employee Object & Selected Target Objects
  const currentSourceRep = employees.find((e) => e.id === sourceEmpId);
  const selectedTargetEmployees = employees.filter((e) => targetEmpIds.includes(e.id));

  // Execute Reassignment
  const handleExecuteReassignment = async () => {
    if (selectedLeadIds.length === 0) {
      setToastMessage({
        type: "error",
        text: "Please select at least 1 lead to reassign.",
      });
      return;
    }
    if (targetEmpIds.length === 0) {
      setToastMessage({
        type: "error",
        text: "Please select target employee(s) from the dropdown to receive the leads.",
      });
      return;
    }

    setIsSubmitting(true);
    setToastMessage(null);

    try {
      const res = await fetch("/api/admin/leads/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          toEmployeeIds: targetEmpIds,
          reason: reassignReason,
          resetStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reassign leads");
      }

      setToastMessage({
        type: "success",
        text: `✅ Reassigned ${json.reassignedCount} lead(s) from ${
          currentSourceRep?.name || "Representative"
        } to ${json.toEmployeeName}! Single-ownership preserved, zero duplicate records created.`,
      });

      setSelectedLeadIds([]);
      router.refresh();
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.message || "An error occurred while reassigning leads",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-amber-500">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between relative z-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">
              Leads Reassign Control <GradientText>Center</GradientText>
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/admin/leads"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>🎯</span> Lead Center
            </Link>
            <Link
              href="/admin/employees"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>👥</span> Employees
            </Link>
          </div>
        </div>

        {/* Studio View Selector */}
        <div className="mt-7 flex items-center gap-2 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => setActiveTab("direct")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "direct"
                ? "bg-amber-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>⚡</span> Direct Reassignment Studio
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "audit"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📜</span> Transfer Audit Logs
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "audit" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-800"
              }`}
            >
              {auditLogs.length} Events
            </span>
          </button>
        </div>
      </section>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`rounded-2xl p-4 flex items-center justify-between border ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{toastMessage.type === "success" ? "✓" : "✕"}</span>
            <p className="text-xs font-bold">{toastMessage.text}</p>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs font-extrabold hover:underline ml-4 text-ink-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIRECT REASSIGNMENT STUDIO                                                */}
      {/* ========================================================================= */}
      {activeTab === "direct" && (
        <div className="rounded-3xl bg-white p-5 neo-panel">
          {/* Sleek gradient header, matching the AI Calls cards */}
          <div className="-mx-5 -mt-5 mb-1 flex flex-wrap items-center justify-between gap-3 rounded-t-3xl border-b border-line bg-gradient-to-r from-sky-100 via-violet-100 to-orange-100 px-5 py-3.5">
            <h3 className="text-lg font-extrabold tracking-tight text-ink">
              Reassign Leads Between <GradientText>Representatives</GradientText>
            </h3>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold text-ink border border-white shadow-xs">
              {selectedLeadIds.length} of {filteredLeads.length} Selected
            </span>
          </div>

          {/* Compact 2-step control strip — one row, no nested boxes */}
          <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:divide-x lg:divide-line items-start">
            {/* STEP 1: CURRENT EMPLOYEE */}
            <div className="lg:pr-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase text-ink-faint">
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-600 text-white text-[9px]">
                    1
                  </span>
                  Current Employee
                </span>
                {currentSourceRep && (
                  <span className="text-[10px] font-bold text-ink-faint">
                    {currentSourceRep.totalLeads} in queue
                  </span>
                )}
              </div>

              <select
                value={sourceEmpId}
                onChange={(e) => setSourceEmpId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-slate-50/70 px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">-- All Representatives & Queues --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.totalLeads} active leads • {emp.territory})
                  </option>
                ))}
                <option value="UNASSIGNED">Unassigned Pool</option>
              </select>

              {/* Filter by Status: Dropdown (covers full width) & Quick Pills */}
              <div className="mt-2.5 space-y-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full rounded-lg border border-line bg-slate-50/70 px-3 py-1.5 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">All Statuses ({statusCounts.ALL})</option>
                  <option value="STAGNANT">⏱️ Stagnant / Uncontacted ({statusCounts.STAGNANT})</option>
                  <option value="NEW">✨ Fresh ({statusCounts.NEW})</option>
                  <option value="CONTACTED">📞 Contacted ({statusCounts.CONTACTED})</option>
                  <option value="INTERESTED">★ Interested ({statusCounts.INTERESTED})</option>
                  <option value="DEAD">✕ Dead ({statusCounts.DEAD})</option>
                  <option value="CONVERTED">✓ Converted ({statusCounts.CONVERTED})</option>
                </select>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "ALL"
                        ? "bg-ink text-white"
                        : "bg-slate-100 text-ink-muted hover:bg-slate-200"
                    }`}
                  >
                    All ({statusCounts.ALL})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("STAGNANT")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "STAGNANT"
                        ? "bg-amber-600 text-white"
                        : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    ⏱️ Stagnant ({statusCounts.STAGNANT})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("NEW")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "NEW"
                        ? "bg-sky-600 text-white"
                        : "bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100"
                    }`}
                  >
                    ✨ Fresh ({statusCounts.NEW})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("CONTACTED")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "CONTACTED"
                        ? "bg-blue-600 text-white"
                        : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                    }`}
                  >
                    📞 Contacted ({statusCounts.CONTACTED})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("INTERESTED")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "INTERESTED"
                        ? "bg-purple-600 text-white"
                        : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100"
                    }`}
                  >
                    ★ Interested ({statusCounts.INTERESTED})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("DEAD")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "DEAD"
                        ? "bg-rose-600 text-white"
                        : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    ✕ Dead ({statusCounts.DEAD})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("CONVERTED")}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${
                      statusFilter === "CONVERTED"
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    ✓ Converted ({statusCounts.CONVERTED})
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="text-ink-muted font-medium">
                  Selected: <strong className="text-ink">{selectedLeadIds.length}</strong>
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="font-bold text-primary hover:underline"
                >
                  {allFilteredSelected ? "Deselect All" : `Select All (${filteredLeads.length})`}
                </button>
              </div>
            </div>

            {/* STEP 2 + 3: NEW EMPLOYEE, MERGED WITH CONFIRM & TRANSFER */}
            <div ref={dropdownRef} className="relative lg:pl-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase text-ink-faint">
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-600 text-white text-[9px]">
                    2
                  </span>
                  New Employee
                </span>
                <span className="text-[10px] font-bold text-ink-faint">
                  {targetEmpIds.length} selected
                </span>
              </div>

              {/* Multi-Select Dropdown Trigger */}
              <div className="relative mt-2">
                <button
                  type="button"
                  onClick={() => setIsTargetDropdownOpen(!isTargetDropdownOpen)}
                  className="w-full rounded-lg border border-line bg-slate-50/70 px-3 py-2 text-left text-xs font-semibold text-ink flex items-center justify-between hover:border-amber-500 transition focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <span className="truncate">
                    {targetEmpIds.length === 0 ? (
                      <span className="text-ink-faint font-normal">
                        -- Click to choose target employee(s) --
                      </span>
                    ) : targetEmpIds.length === availableTargetEmployees.length && availableTargetEmployees.length > 0 ? (
                      <span className="text-emerald-800 font-bold">
                        ✓ All {availableTargetEmployees.length} available employees
                      </span>
                    ) : (
                      <span className="text-emerald-800 font-bold">
                        {targetEmpIds.length} selected: {selectedTargetEmployees.map((e) => e.name).join(", ")}
                      </span>
                    )}
                  </span>
                  <svg
                    className={`h-4 w-4 text-ink-faint transition-transform shrink-0 ml-2 ${
                      isTargetDropdownOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Popover Dropdown Menu */}
                {isTargetDropdownOpen && (
                  <div className="absolute z-30 mt-1.5 w-full rounded-2xl bg-white p-3 border border-line shadow-2xl space-y-2">
                    {/* Quick Selection Helpers */}
                    <div className="flex items-center justify-between border-b border-line/60 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Select 1, 2, 3 or All:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTargetEmpIds(availableTargetEmployees.map((e) => e.id))
                          }
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          Select All ({availableTargetEmployees.length})
                        </button>
                        <span className="text-ink-faint text-xs">|</span>
                        <button
                          type="button"
                          onClick={() => setTargetEmpIds([])}
                          className="text-[11px] font-bold text-ink-faint hover:text-rose-600"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* List of Employees with Checkboxes */}
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {availableTargetEmployees.map((emp) => {
                        const isSelected = targetEmpIds.includes(emp.id);
                        return (
                          <div
                            key={emp.id}
                            onClick={() => toggleTargetEmployee(emp.id)}
                            className={`cursor-pointer rounded-xl px-3 py-2 transition flex items-center justify-between border ${
                              isSelected
                                ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400"
                                : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-200"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <div>
                                <p className="text-xs font-bold text-ink leading-tight">{emp.name}</p>
                                <p className="text-[10px] text-ink-faint">
                                  {emp.territory} • {emp.totalLeads} active leads
                                </p>
                              </div>
                            </div>

                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              {emp.winRate}% Win Rate
                            </span>
                          </div>
                        );
                      })}

                      {availableTargetEmployees.length === 0 && (
                        <p className="text-xs text-ink-faint py-3 text-center">
                          No other representatives available.
                        </p>
                      )}
                    </div>

                    <div className="border-t border-line/60 pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsTargetDropdownOpen(false)}
                        className="rounded-lg bg-ink px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800"
                      >
                        Apply Selection
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Employee Pills with Remove Button */}
              {targetEmpIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedTargetEmployees.map((emp) => (
                    <span
                      key={emp.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800"
                    >
                      {emp.name}
                      <button
                        type="button"
                        onClick={() => toggleTargetEmployee(emp.id)}
                        className="hover:text-rose-600 font-black ml-0.5 text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* STEP 3: REASON FOR REASSIGN */}
              <div className="mt-3 pt-3 border-t border-line/60">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase text-ink-faint">
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-600 text-white text-[9px]">
                    3
                  </span>
                  Reason For Reassign
                </span>

                {/* One-line dynamic summary, only shown when leads are selected */}
                {selectedLeadIds.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                    {targetEmpIds.length === 0 ? (
                      <>
                        <strong className="text-ink">{selectedLeadIds.length}</strong> lead(s) selected — choose new employee(s) above.
                      </>
                    ) : targetEmpIds.length === 1 ? (
                      <>
                        Transferring <strong className="text-ink">{selectedLeadIds.length}</strong> lead(s) from{" "}
                        <strong className="text-ink">{currentSourceRep?.name || "All / Filtered"}</strong> to{" "}
                        <strong className="text-emerald-700">{selectedTargetEmployees[0]?.name}</strong>.
                      </>
                    ) : (
                      <>
                        Distributing <strong className="text-ink">{selectedLeadIds.length}</strong> leads across{" "}
                        <strong className="text-emerald-700">{targetEmpIds.length} reps</strong> — approx.{" "}
                        <strong className="text-emerald-700">
                          {Math.ceil(selectedLeadIds.length / targetEmpIds.length)}
                        </strong>{" "}
                        each.
                      </>
                    )}
                  </p>
                )}

                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Reason for reassigning leads..."
                  className="mt-2 w-full rounded-lg border border-line bg-slate-50/70 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-amber-500"
                />

                <button
                  type="button"
                  disabled={isSubmitting || selectedLeadIds.length === 0 || targetEmpIds.length === 0}
                  onClick={handleExecuteReassignment}
                  className={`mt-2.5 w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-0.5 ${
                    selectedLeadIds.length > 0 && targetEmpIds.length > 0 && !isSubmitting
                      ? "bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-md shadow-amber-500/25 hover:scale-[1.01]"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <span className="py-1">⚡ Assigning {selectedLeadIds.length} Leads...</span>
                  ) : selectedLeadIds.length === 0 ? (
                    <div className="py-1 text-slate-500">Select Leads Below to Assign</div>
                  ) : targetEmpIds.length === 0 ? (
                    <div className="py-1 text-slate-500">Choose New Employee(s) Above</div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span>⚡</span>
                      <span>
                        {targetEmpIds.length === 1
                          ? `ASSIGN ${selectedLeadIds.length} LEAD${selectedLeadIds.length === 1 ? "" : "S"} TO ${selectedTargetEmployees[0]?.name.toUpperCase()}`
                          : `DISTRIBUTE ${selectedLeadIds.length} LEADS ACROSS ${targetEmpIds.length} EMPLOYEES`}
                      </span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* MERGED: LEADS TABLE, SAME CARD, NO SEPARATE PANEL                      */}
          {/* ===================================================================== */}
          <div className="mt-5 pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h4 className="text-sm font-bold text-ink">
              Leads Allocated to {currentSourceRep?.name || "All Representatives"}
            </h4>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search party, phone, city, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary w-56"
              />

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-xs text-ink font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Sources</option>
                <option value="META">Meta Ads Leads</option>
                <option value="INDIAMART">IndiaMART Leads</option>
                <option value="WEBSITE">Website Forms</option>
                <option value="MANUAL">Manual / Walk-in</option>
              </select>

              <button
                type="button"
                onClick={toggleSelectAll}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                  allFilteredSelected
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : "bg-white text-ink border-line hover:bg-slate-50"
                }`}
              >
                {allFilteredSelected ? "✓ Deselect All" : `Select All (${filteredLeads.length})`}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                    </th>
                    <th className="pb-3">Lead / Applicant Name</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Marketing Source</th>
                    <th className="pb-3">Days in Queue</th>
                    <th className="pb-3">Calls Made</th>
                    <th className="pb-3">Current Status</th>
                    <th className="pb-3">Inquiry Requirements & Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {paginatedLeads.map((lead) => {
                    const isChecked = selectedLeadIds.includes(lead.id);
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => toggleSelectLead(lead.id)}
                        className={`cursor-pointer transition ${
                          isChecked ? "bg-amber-50/40" : "hover:bg-slate-50/50"
                        }`}
                      >
                        <td className="py-3.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectLead(lead.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                          />
                        </td>
                        <td className="py-3.5">
                          <div className="font-bold text-ink flex items-center gap-1.5">
                            {lead.name}
                            {lead.reassignedCount > 0 && (
                              <span className="rounded bg-indigo-100 text-indigo-800 px-1.5 py-0.2 text-[9px] font-bold">
                                Reassigned #{lead.reassignedCount}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-ink-faint">
                            Allocated to {lead.assignedEmployeeName}
                          </span>
                        </td>
                        <td className="py-3.5 text-ink font-mono text-[11px]">
                          {lead.phoneNumber || "—"}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                              lead.source === "META"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : lead.source === "INDIAMART"
                                ? "bg-teal-50 text-teal-800 border-teal-200"
                                : lead.source === "WHATSAPP"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : lead.source === "WEBSITE"
                                ? "bg-purple-50 text-purple-800 border-purple-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {lead.source}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              lead.daysWithCurrentRep >= 3
                                ? "bg-amber-100 text-amber-800"
                                : lead.daysWithCurrentRep >= 1
                                ? "bg-slate-100 text-slate-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {lead.daysWithCurrentRep} day{lead.daysWithCurrentRep === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="py-3.5">
                          {lead.callsLoggedCount === 0 ? (
                            <span className="rounded bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-[10px] font-bold">
                              0 Calls (Stagnant)
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                              {lead.callsLoggedCount} Call{lead.callsLoggedCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                              lead.status === "CONVERTED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : lead.status === "INTERESTED"
                                ? "bg-purple-50 text-purple-800 border-purple-200"
                                : lead.status === "CONTACTED"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : lead.status === "NOT_INTERESTED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {lead.status === "NOT_INTERESTED" ? "DEAD LEAD" : lead.status}
                          </span>
                        </td>
                        <td className="py-3.5 max-w-xs text-ink-muted text-[11px] truncate" title={lead.inquiryDetails || ""}>
                          {lead.inquiryDetails || "Standard PCD inquiry."}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-ink-faint">
                        No leads found under {currentSourceRep?.name || "this employee"} matching the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredLeads.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-ink-muted">
                  Showing {(currentPage - 1) * LEADS_PER_PAGE + 1}–{Math.min(currentPage * LEADS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length} leads
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                    className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint"
                  >
                    ← Previous
                  </button>
                  <span className="px-2 text-xs font-bold text-ink">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
      )}

      {/* TAB 2: AUDIT HISTORY                                                      */}
      {/* ========================================================================= */}
      {activeTab === "audit" && (
        <div className="rounded-3xl p-6 sm:p-7 neo-panel border-t-2 border-t-indigo-500 bg-white shadow-xs space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  Lead Handover Audit Trail
                </span>
              </div>
              <h3 className="font-black text-ink text-xl mt-2 tracking-tight">
                Permanent Lead Transfer <GradientText>Audit Logs</GradientText>
              </h3>
              <p className="text-xs text-ink-muted mt-1 max-w-2xl leading-relaxed">
                Complete history of reassigned leads: when transferred, from whom, to whom, and reason.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-xs font-black text-indigo-800 shadow-2xs">
                📜 {filteredAuditLogs.length} Events Logged
              </span>
            </div>
          </div>

          {/* Clean Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex flex-1 flex-col sm:flex-row gap-2.5">
              {/* Rep / Employee Filter */}
              <div className="w-full sm:w-64 shrink-0">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-faint mb-1">
                  Filter by Employee
                </label>
                <select
                  value={auditRepFilter}
                  onChange={(e) => setAuditRepFilter(e.target.value)}
                  className="w-full rounded-xl border border-line bg-slate-50/80 px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">All Employees (Full History)</option>
                  {auditRepOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div className="w-full sm:w-48 shrink-0">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-faint mb-1">
                  Reassigned Date
                </label>
                <input
                  type="date"
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                  aria-label="Filter by date reassigned"
                  className="w-full rounded-xl border border-line bg-slate-50/80 px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Search */}
              <div className="relative flex-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-faint mb-1">
                  Search Records
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-ink-faint text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Search by lead name, phone, or reason..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full rounded-xl border border-line bg-slate-50/80 pl-8 pr-8 py-2 text-xs font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  {auditSearch && (
                    <button
                      type="button"
                      onClick={() => setAuditSearch("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-ink-faint hover:text-ink cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(auditSearch || auditRepFilter !== "ALL" || auditDateFilter) && (
              <div className="self-end sm:self-auto sm:pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setAuditSearch("");
                    setAuditRepFilter("ALL");
                    setAuditDateFilter("");
                  }}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition whitespace-nowrap cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-line/70">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 border-b border-line text-ink-faint uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 whitespace-nowrap min-w-[150px]">Date &amp; Time</th>
                  <th className="px-5 py-3.5 min-w-[220px]">Lead / Party</th>
                  <th className="px-5 py-3.5 min-w-[280px]">Handover Route</th>
                  <th className="px-5 py-3.5 min-w-[240px]">Reason for Reassign</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap min-w-[100px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 bg-white">
                {paginatedAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition group">
                    {/* 1. Date & Time */}
                    <td className="px-5 py-4 whitespace-nowrap align-middle">
                      <div className="flex flex-col">
                        <span className="font-bold text-ink text-xs">
                          {formatDate(log.reassignedAt)}
                        </span>
                        <span className="text-[11px] text-ink-faint flex items-center gap-1 mt-0.5">
                          <span>⏰</span> {formatTime(log.reassignedAt)}
                        </span>
                      </div>
                    </td>

                    {/* 2. Lead Details */}
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/admin/lead-history/${log.leadId}`}
                          className="font-bold text-ink hover:text-primary hover:underline text-xs inline-flex items-center gap-1 group-hover:text-indigo-600 transition"
                        >
                          <span>{log.leadName}</span>
                          <span className="text-[10px] text-indigo-500 opacity-60">↗</span>
                        </Link>
                        <span className="text-[11px] text-ink-muted font-mono">
                          {log.leadPhone ? `📞 ${log.leadPhone}` : "—"}
                        </span>
                      </div>
                    </td>

                    {/* 3. Handover Route (From -> To) */}
                    <td className="px-5 py-4 align-middle">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50/90 border border-rose-200/80 px-2.5 py-1 text-xs shadow-2xs">
                          <span className="text-[9px] font-black uppercase text-rose-500 tracking-wider">
                            FROM
                          </span>
                          <span className="font-bold text-rose-800">
                            {log.fromEmployeeName || "Unassigned"}
                          </span>
                        </div>
                        <span className="text-ink-faint font-black text-sm">➔</span>
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200/80 px-2.5 py-1 text-xs shadow-2xs">
                          <span className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">
                            TO
                          </span>
                          <span className="font-bold text-emerald-800">
                            {log.toEmployeeName || "Unassigned"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 4. Reason for Transfer */}
                    <td className="px-5 py-4 align-middle">
                      <div className="rounded-xl bg-slate-50/90 border border-line/80 px-3 py-2 text-[11px] text-ink-muted leading-relaxed max-w-sm shadow-2xs">
                        <p className="line-clamp-2" title={log.reason || "Reassigned for performance conversion testing"}>
                          {log.reason || "Reassigned for performance conversion testing"}
                        </p>
                      </div>
                    </td>

                    {/* 5. Action */}
                    <td className="px-5 py-4 text-right whitespace-nowrap align-middle">
                      <Link
                        href={`/admin/lead-history/${log.leadId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line bg-white hover:bg-slate-50 text-[11px] font-bold text-ink-muted hover:text-ink transition shadow-2xs"
                      >
                        <span>History</span>
                        <span>↗</span>
                      </Link>
                    </td>
                  </tr>
                ))}

                {paginatedAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-ink-faint">
                      {auditLogs.length === 0 ? (
                        <div className="space-y-1">
                          <p className="font-bold text-ink">No reassignment records found yet</p>
                          <p className="text-xs text-ink-muted">
                            Use the Direct Reassignment Studio to transfer leads between representatives.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="font-bold text-ink">No audit logs match your filter</p>
                          <p className="text-xs text-ink-muted">
                            Try selecting another employee or clearing your search filter.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setAuditSearch("");
                              setAuditRepFilter("ALL");
                              setAuditDateFilter("");
                            }}
                            className="inline-block mt-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                          >
                            Reset Filters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredAuditLogs.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-ink-muted">
                Showing {(currentAuditPage - 1) * AUDIT_PER_PAGE + 1}–
                {Math.min(currentAuditPage * AUDIT_PER_PAGE, filteredAuditLogs.length)} of{" "}
                {filteredAuditLogs.length} transfer events
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentAuditPage <= 1}
                  onClick={() => setAuditPage(currentAuditPage - 1)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint shadow-2xs cursor-pointer"
                >
                  ← Previous
                </button>
                <span className="px-2 text-xs font-bold text-ink">
                  Page {currentAuditPage} of {totalAuditPages}
                </span>
                <button
                  type="button"
                  disabled={currentAuditPage >= totalAuditPages}
                  onClick={() => setAuditPage(currentAuditPage + 1)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint shadow-2xs cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
