"use client";

import { useEffect, useState } from "react";
import { LeadSource, LeadStatus } from "@/generated/prisma/enums";

interface EmployeeOption {
  id: string;
  name: string;
}

interface ExportLeadsModalProps {
  employees: EmployeeOption[];
  currentDivision?: string;
  currentSource?: string;
  currentRep?: string;
  currentStatus?: string;
  currentSearch?: string;
}

const sourceOptions = [
  { value: "all", label: "All Platforms / Sources" },
  { value: LeadSource.META, label: "Meta Ads (Facebook & IG)" },
  { value: LeadSource.INDIAMART, label: "IndiaMART Enquiries" },
  { value: LeadSource.PHARMAHOPERS, label: "PharmaHopers" },
  { value: LeadSource.PHARMAKHABAR, label: "PharmaKhabar" },
  { value: LeadSource.WEBSITE, label: "Website Forms" },
  { value: LeadSource.WHATSAPP, label: "WhatsApp Leads" },
  { value: LeadSource.EXCEL_IMPORT, label: "Excel / Sheet Import" },
  { value: LeadSource.MANUAL, label: "Manual Entry" },
];

const statusOptions = [
  { value: "all", label: "All Statuses & Stages" },
  { value: "ACTIVE", label: "🟢 Active Pipeline (Excludes Dead & Converted)" },
  { value: "FRESH", label: "⚪ Fresh / Uncontacted Only" },
  { value: LeadStatus.INTERESTED, label: "⭐ Interested / High Intent" },
  { value: LeadStatus.CONVERTED, label: "🟣 Converted / Won" },
  { value: "DEAD", label: "🔴 Dead Leads" },
  { value: "IRRELEVANT", label: "🚫 Irrelevant Leads" },
  { value: LeadStatus.NEW, label: "New Leads" },
  { value: LeadStatus.ASSIGNED, label: "Assigned Leads" },
  { value: LeadStatus.CONTACTED, label: "Contacted Leads" },
];

export function ExportLeadsModal({
  employees,
  currentDivision = "ALL",
  currentSource = "all",
  currentRep = "all",
  currentStatus = "all",
  currentSearch = "",
}: ExportLeadsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [limit, setLimit] = useState<string>("all");
  const [customLimit, setCustomLimit] = useState<string>("100");
  const [datePreset, setDatePreset] = useState<string>("all_time");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [rep, setRep] = useState<string>(currentRep || "all");
  const [status, setStatus] = useState<string>(currentStatus || "all");
  const [division, setDivision] = useState<string>(currentDivision || "ALL");
  const [source, setSource] = useState<string>(currentSource || "all");
  const [search, setSearch] = useState<string>(currentSearch || "");
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync initial values when modal opens
  useEffect(() => {
    if (isOpen) {
      setDivision(currentDivision || "ALL");
      setSource(currentSource || "all");
      setRep(currentRep || "all");
      setStatus(currentStatus || "all");
      setSearch(currentSearch || "");
    }
  }, [isOpen, currentDivision, currentSource, currentRep, currentStatus, currentSearch]);

  // Handle ESC key and scroll locking
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDownload = () => {
    setIsDownloading(true);

    const params = new URLSearchParams();
    if (division && division !== "ALL") params.set("division", division);
    if (source && source !== "all") params.set("source", source);
    if (status && status !== "all") params.set("status", status);

    if (rep === "unassigned") {
      params.set("unassigned", "1");
    } else if (rep && rep !== "all") {
      params.set("employeeId", rep);
    }

    if (datePreset === "custom") {
      params.set("range", "custom");
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    } else if (datePreset && datePreset !== "all_time") {
      params.set("range", datePreset);
    }

    if (limit === "custom") {
      const num = parseInt(customLimit, 10);
      if (!isNaN(num) && num > 0) params.set("limit", String(num));
    } else if (limit && limit !== "all") {
      params.set("limit", limit);
    }

    if (search.trim()) {
      params.set("search", search.trim());
    }

    const downloadUrl = `/api/admin/leads/export?${params.toString()}`;

    // Create programmatic anchor to trigger native download
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset loading state and close modal after brief delay
    setTimeout(() => {
      setIsDownloading(false);
      setIsOpen(false);
    }, 900);
  };

  return (
    <>
      {/* Trigger Button: matches existing Lead Center top toolbar button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs shrink-0 cursor-pointer"
      >
        <svg
          className="h-3.5 w-3.5 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Export to Excel (.xlsx)
      </button>

      {/* Centered Modal Backdrop & Dialog */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-leads-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDownloading) setIsOpen(false);
          }}
        >
          <div className="relative w-full max-w-xl rounded-3xl bg-white border border-line shadow-2xl p-6 sm:p-7 text-left my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 text-xl shadow-xs">
                  📊
                </div>
                <div>
                  <h3
                    id="export-leads-title"
                    className="text-base sm:text-lg font-black text-ink"
                  >
                    Export Leads to Excel
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Configure your download filters before generating the .xlsx report
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDownloading}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-ink-muted hover:bg-slate-200 hover:text-ink transition cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Filter Form Controls Grid */}
            <div className="mt-5 space-y-4">
              {/* Row 1: Volume Limit & Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Lead Volume / Limit */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Number of Leads
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Available Leads (No Limit)</option>
                    <option value="50">First 50 Leads</option>
                    <option value="100">First 100 Leads</option>
                    <option value="250">First 250 Leads</option>
                    <option value="500">First 500 Leads</option>
                    <option value="1000">First 1,000 Leads</option>
                    <option value="custom">Custom Quantity...</option>
                  </select>
                  {limit === "custom" && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="20000"
                        value={customLimit}
                        onChange={(e) => setCustomLimit(e.target.value)}
                        placeholder="e.g. 300"
                        className="w-full h-8 rounded-lg border border-line px-2.5 text-xs font-medium text-ink focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-[11px] font-semibold text-ink-muted whitespace-nowrap">leads</span>
                    </div>
                  )}
                </div>

                {/* Date Range Preset */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Date Range
                  </label>
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all_time">All Time (No Date Filter)</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_week">Last 7 Days</option>
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last 30 Days</option>
                    <option value="custom">Custom Date Range...</option>
                  </select>
                </div>
              </div>

              {/* Custom Date Pickers (visible only when 'custom' selected) */}
              {datePreset === "custom" && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 border border-line-soft">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-ink-muted mb-1">
                      From Date:
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-ink-muted mb-1">
                      To Date:
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Row 2: Assigned Representative & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Representative */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Assigned Representative
                  </label>
                  <select
                    value={rep}
                    onChange={(e) => setRep(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Representatives</option>
                    <option value="unassigned">⚠️ Unassigned Leads Only</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status / Stage */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Status / Stage
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Category / Division & Source / Platform */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Division Category */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Category / Division
                  </label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="PCD_FRANCHISE">🏢 PCD Pharma Franchise</option>
                    <option value="THIRD_PARTY">🏭 Third-Party Manufacturing</option>
                  </select>
                </div>

                {/* Platform / Source */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Platform / Lead Source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    {sourceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Keyword Search (Optional) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                  Search / Keyword Filter <span className="text-[10px] font-normal text-ink-faint">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by prospect name, phone, city, or note..."
                  className="w-full h-9 rounded-xl border border-line bg-white px-3 text-xs font-medium text-ink shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modal Footer & Download Button */}
            <div className="mt-6 pt-4 border-t border-line-soft flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDownloading}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-line bg-white text-xs font-bold text-ink-muted hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition active:scale-98 cursor-pointer ${
                  isDownloading ? "opacity-75 cursor-not-allowed" : ""
                }`}
              >
                {isDownloading ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Generating Excel File...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4 text-emerald-100"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    <span>Download Excel (.xlsx)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
