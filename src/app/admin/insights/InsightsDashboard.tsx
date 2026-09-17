"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  InsightsData,
  PcdClientRow,
  PcdInquiryRow,
  ThirdPartyClientRow,
  ThirdPartyInquiryRow,
  TerritoryRow,
  DosageFormStat,
  CreditTermStat,
  OverdueCreditRow,
  NearExpiryProductRow,
  LowStockProductRow,
  ClientCadenceRow,
  EmployeePerformanceRow,
  CallOperationRow,
  LeadStageStat,
  FollowupTaskRow,
  ChannelStat,
} from "./types";

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

type ActiveTabType =
  | "overview"
  | "pcd"
  | "thirdparty"
  | "stock"
  | "reorders"
  | "workforce"
  | "telephony"
  | "ledger";

export function InsightsDashboard({ data }: { data: InsightsData }) {
  const [activeTab, setActiveTab] = useState<ActiveTabType>("overview");
  const [pcdSearch, setPcdSearch] = useState("");
  const [tpSearch, setTpSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [reorderSearch, setReorderSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [callSearch, setCallSearch] = useState("");

  const { summary } = data;

  // Filtered PCD inquiries
  const filteredPcdInquiries = useMemo(() => {
    if (!pcdSearch.trim()) return data.pcdInquiries;
    const q = pcdSearch.toLowerCase();
    return data.pcdInquiries.filter(
      (inq) =>
        inq.name.toLowerCase().includes(q) ||
        (inq.phoneNumber && inq.phoneNumber.includes(q)) ||
        inq.targetTerritory.toLowerCase().includes(q) ||
        (inq.inquiryDetails && inq.inquiryDetails.toLowerCase().includes(q)) ||
        inq.source.toLowerCase().includes(q)
    );
  }, [data.pcdInquiries, pcdSearch]);

  // Filtered Third Party inquiries
  const filteredTpInquiries = useMemo(() => {
    if (!tpSearch.trim()) return data.thirdPartyInquiries;
    const q = tpSearch.toLowerCase();
    return data.thirdPartyInquiries.filter(
      (inq) =>
        inq.name.toLowerCase().includes(q) ||
        (inq.phoneNumber && inq.phoneNumber.includes(q)) ||
        (inq.inquiryDetails && inq.inquiryDetails.toLowerCase().includes(q)) ||
        inq.source.toLowerCase().includes(q)
    );
  }, [data.thirdPartyInquiries, tpSearch]);

  // Filtered Low Stock & Expiry
  const filteredLowStock = useMemo(() => {
    if (!stockSearch.trim()) return data.lowStockProducts;
    const q = stockSearch.toLowerCase();
    return data.lowStockProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.dosageForm && p.dosageForm.toLowerCase().includes(q))
    );
  }, [data.lowStockProducts, stockSearch]);

  // Filtered Reorder Cadence
  const filteredCadence = useMemo(() => {
    if (!reorderSearch.trim()) return data.clientCadenceRows;
    const q = reorderSearch.toLowerCase();
    return data.clientCadenceRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.territory.toLowerCase().includes(q) ||
        r.mrName.toLowerCase().includes(q)
    );
  }, [data.clientCadenceRows, reorderSearch]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return data.followupTasks;
    const q = taskSearch.toLowerCase();
    return data.followupTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.repName.toLowerCase().includes(q) ||
        t.taskType.toLowerCase().includes(q)
    );
  }, [data.followupTasks, taskSearch]);

  // Filtered Calls
  const filteredCalls = useMemo(() => {
    if (!callSearch.trim()) return data.callOperationsRows;
    const q = callSearch.toLowerCase();
    return data.callOperationsRows.filter(
      (c) =>
        c.repName.toLowerCase().includes(q) ||
        c.targetName.toLowerCase().includes(q) ||
        (c.summary && c.summary.toLowerCase().includes(q))
    );
  }, [data.callOperationsRows, callSearch]);

  return (
    <div className="space-y-8">
      {/* Header Banner - Comprehensive Holistic CRM Insights */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-primary">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Pure Deterministic Logic
              </span>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800 border border-sky-200">
                Marg ERP 9+ / Busy Synced
              </span>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800 border border-purple-200">
                All CRM Modules Intelligence
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-ink">
              Commercial & Operations Insights
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Holistic intelligence hub covering every system in your CRM: PCD Pharma franchise monopoly, 
              third-party batch manufacturing, Marg ERP billing ledger, Stock IQ inventory valuation, reorder cadences, 
              field representative performance, and telephony operations.
            </p>
          </div>

          {/* Quick Direct Module Jump Links */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/admin/stock-iq"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>📦</span> Stock IQ
            </Link>
            <Link
              href="/admin/reorders"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>🔄</span> Reorders
            </Link>
            <Link
              href="/admin/credits"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>💳</span> Credits
            </Link>
            <Link
              href="/admin/employees"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-ink border border-line neo-button hover:text-primary transition"
            >
              <span>👥</span> MRs
            </Link>
            <Link
              href="/admin/leads"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-white neo-button hover:bg-primary-strong transition shadow-sm"
            >
              <span>🎯</span> Leads
            </Link>
          </div>
        </div>

        {/* 8-Tab Navigation Ribbon Covering Everything */}
        <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2 border-t border-line pt-5 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "overview"
                ? "bg-ink text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📊</span> Executive Pulse
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pcd")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "pcd"
                ? "bg-primary text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>💊</span> PCD Franchise
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "pcd" ? "bg-white/20 text-white" : "bg-primary-soft text-primary-strong"
              }`}
            >
              {summary.totalPcdClients} Parties
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("thirdparty")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "thirdparty"
                ? "bg-purple-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>🏭</span> Third-Party Mfg
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "thirdparty" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"
              }`}
            >
              {summary.totalTpClients} Brands
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stock")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "stock"
                ? "bg-amber-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📦</span> Stock IQ & Warehouse
            {summary.lowStockCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === "stock" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                }`}
              >
                {summary.lowStockCount} Low
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reorders")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "reorders"
                ? "bg-teal-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>🔄</span> Reorders & Cadence
            {summary.reordersDueNowCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === "reorders" ? "bg-white/20 text-white" : "bg-teal-100 text-teal-800"
                }`}
              >
                {summary.reordersDueNowCount} Due
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("workforce")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "workforce"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>👥</span> Field MRs & Tasks
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "workforce" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-800"
              }`}
            >
              {summary.totalEmployees} MRs
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("telephony")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "telephony"
                ? "bg-rose-600 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📞</span> Leads & Telephony
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "telephony" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"
              }`}
            >
              {summary.totalCalls} Calls
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === "ledger"
                ? "bg-emerald-700 text-white shadow-md"
                : "bg-white text-ink-muted border border-line hover:bg-slate-50"
            }`}
          >
            <span>📑</span> Marg Credit Ledger
            {summary.overdueCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === "ledger" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                }`}
              >
                {summary.overdueCount} Overdue
              </span>
            )}
          </button>
        </div>
      </section>

      {/* Top 6 KPI Pulse Cards (Covering Commercial, Inventory, Workforce, Pipeline) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Metric 1: Commercial Parties */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-primary p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Parties</p>
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-800">+{summary.newClientsMonth} MoM</span>
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{summary.totalClients}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{summary.totalPcdClients} PCD • {summary.totalTpClients} TP</p>
        </div>

        {/* Metric 2: Gross Turnover */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-indigo-500 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Billed Revenue</p>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-800">Marg Synced</span>
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{formatINR(summary.totalRevenue)}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{summary.totalBoxesShipped.toLocaleString("en-IN")} Boxes Shipped</p>
        </div>

        {/* Metric 3: Warehouse Valuation */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-amber-500 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Warehouse Stock</p>
            {summary.lowStockCount > 0 ? (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{summary.lowStockCount} Low</span>
            ) : (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Optimal</span>
            )}
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{summary.totalStockBoxes.toLocaleString("en-IN")}</p>
          <p className="mt-1 text-[11px] text-ink-faint">Valuation: {formatINR(summary.totalInventoryCost)}</p>
        </div>

        {/* Metric 4: Reorder Compliance */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-teal-500 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Reorder Retention</p>
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800">{summary.repeatPcdRate}%</span>
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{summary.reordersDueNowCount} Due Now</p>
          <p className="mt-1 text-[11px] text-ink-faint">Avg {summary.avgCadenceIntervalDays}d order cadence</p>
        </div>

        {/* Metric 5: Field MRs & Tasks */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-purple-600 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">MR Workforce</p>
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-bold text-purple-800">{summary.taskCompletionRate}% Tasks</span>
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{summary.totalEmployees} MRs</p>
          <p className="mt-1 text-[11px] text-ink-faint">{summary.pendingTasks} pending field tasks</p>
        </div>

        {/* Metric 6: Inquiries & Calls */}
        <div className="overflow-hidden rounded-2xl neo-panel-soft border-t-2 border-t-rose-500 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Pipeline & Calls</p>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">{summary.overallConversionRate}% Win</span>
          </div>
          <p className="mt-2 text-2xl font-black text-ink">{summary.totalLeads} Leads</p>
          <p className="mt-1 text-[11px] text-ink-faint">{summary.totalCalls} Calls • {summary.whatsappSentCount} WhatsApp</p>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 1: EXECUTIVE PULSE (Overview) */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Dual Division Snapshot Row */}
          <div className="grid gap-7 lg:grid-cols-2">
            {/* PCD Franchise Card */}
            <div className="rounded-3xl p-6 neo-panel border-l-4 border-l-primary flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💊</span>
                    <div>
                      <h2 className="font-black text-ink text-base">PCD Pharma Franchise</h2>
                      <p className="text-xs text-ink-faint">Exclusive monopoly territory distribution</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("pcd")}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    View Deep-Dive →
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-3 neo-pressed bg-slate-50/50">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">Active Parties</p>
                    <p className="text-xl font-black text-ink mt-0.5">{summary.totalPcdClients}</p>
                    <p className="text-[10px] text-emerald-700 font-bold">+{summary.newPcdClientsMonth} this month</p>
                  </div>
                  <div className="rounded-xl p-3 neo-pressed bg-slate-50/50">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">Queries</p>
                    <p className="text-xl font-black text-ink mt-0.5">{summary.totalPcdLeads}</p>
                    <p className="text-[10px] text-primary font-bold">{summary.pcdConversionRate}% Converted</p>
                  </div>
                  <div className="rounded-xl p-3 neo-pressed bg-slate-50/50">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">Monopoly</p>
                    <p className="text-xl font-black text-ink mt-0.5">{summary.monopolyCoverageRate}%</p>
                    <p className="text-[10px] text-teal-700 font-bold">{summary.allottedTerritoriesCount}/{summary.totalTerritoriesCount} Districts</p>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5">
                  <p className="text-xs font-bold text-ink uppercase tracking-wider">Top Inquiry Channels</p>
                  {data.pcdChannelStats.slice(0, 3).map((ch) => (
                    <div key={ch.source} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{ch.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-faint">{ch.count} inq</span>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          {ch.winRate}% win
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs text-ink-muted">
                <span>Total Billed: <strong>{formatINR(summary.pcdRevenue)}</strong></span>
                <span>Avg Deal: <strong>{formatINR(summary.avgPcdOrderValue)}</strong></span>
              </div>
            </div>

            {/* Third-Party Manufacturing Card */}
            <div className="rounded-3xl p-6 neo-panel border-l-4 border-l-purple-600 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏭</span>
                    <div>
                      <h2 className="font-black text-ink text-base">Third-Party & Contract Manufacturing</h2>
                      <p className="text-xs text-ink-faint">Private label brands & institutional bulk batches</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("thirdparty")}
                    className="text-xs font-bold text-purple-700 hover:underline"
                  >
                    View Deep-Dive →
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-3 neo-pressed bg-purple-50/30">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">Brand Accounts</p>
                    <p className="text-xl font-black text-ink mt-0.5">{summary.totalTpClients}</p>
                    <p className="text-[10px] text-purple-700 font-bold">Private Label</p>
                  </div>
                  <div className="rounded-xl p-3 neo-pressed bg-purple-50/30">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">RFQs</p>
                    <p className="text-xl font-black text-ink mt-0.5">{summary.totalTpLeads}</p>
                    <p className="text-[10px] text-emerald-700 font-bold">{summary.tpConversionRate}% Converted</p>
                  </div>
                  <div className="rounded-xl p-3 neo-pressed bg-purple-50/30">
                    <p className="text-[10px] font-bold text-ink-faint uppercase">Batch Revenue</p>
                    <p className="text-xl font-black text-ink mt-0.5">{formatINR(summary.tpRevenue)}</p>
                    <p className="text-[10px] text-indigo-700 font-bold">Marg Synced</p>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5">
                  <p className="text-xs font-bold text-ink uppercase tracking-wider">Dosage Form Production Volume</p>
                  {data.dosageFormStats.slice(0, 3).map((df) => (
                    <div key={df.dosageForm} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{df.dosageForm}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-faint">{df.totalBoxes.toLocaleString("en-IN")} Boxes</span>
                        <span className="font-bold text-purple-700">{df.pctOfTotal}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs text-ink-muted">
                <span>Credit Balance: <strong>{formatINR(summary.tpCreditOutstanding)}</strong></span>
                <span>Dispatched: <strong>{data.thirdPartyClients.reduce((s, c) => s + c.ordersCount, 0)} Batches</strong></span>
              </div>
            </div>
          </div>

          {/* CRM Health Matrix (Stock, Reorders, MRs, Pipeline) */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Box 1: Stock IQ Health */}
            <div className="rounded-3xl p-5 neo-panel flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="font-bold text-ink text-sm">📦 Warehouse Stock IQ</span>
                  <button onClick={() => setActiveTab("stock")} className="text-xs text-amber-700 font-bold hover:underline">
                    Inspect →
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Catalog Products:</span>
                    <span className="font-bold text-ink">{summary.totalSkus} SKUs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Total Inventory Valuation:</span>
                    <span className="font-bold text-ink">{formatINR(summary.totalInventoryCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Critical Low Stock SKUs:</span>
                    <span className="font-bold text-rose-700">{summary.lowStockCount} SKUs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Near-Expiry (&lt;90d):</span>
                    <span className="font-bold text-amber-700">{summary.nearExpiryCount90} Products</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-line text-[11px] text-ink-faint">
                Capital at expiry risk: <strong>{formatINR(summary.capitalAtExpiryRisk)}</strong>
              </div>
            </div>

            {/* Box 2: Reorders Health */}
            <div className="rounded-3xl p-5 neo-panel flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="font-bold text-ink text-sm">🔄 Reorders & Retention</span>
                  <button onClick={() => setActiveTab("reorders")} className="text-xs text-teal-700 font-bold hover:underline">
                    Inspect →
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Repeat Active Clients:</span>
                    <span className="font-bold text-ink">{summary.activeReorderClients} Parties</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Retention Rate:</span>
                    <span className="font-bold text-emerald-700">{summary.repeatPcdRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Reorders Due Now (≤3d):</span>
                    <span className="font-bold text-teal-700">{summary.reordersDueNowCount} Parties</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Cadence Delayed Past Window:</span>
                    <span className="font-bold text-rose-700">{summary.cadenceDelayedCount} Parties</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-line text-[11px] text-ink-faint">
                Network reorder cycle: <strong>~{summary.avgCadenceIntervalDays} Days</strong>
              </div>
            </div>

            {/* Box 3: MR Workforce Health */}
            <div className="rounded-3xl p-5 neo-panel flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="font-bold text-ink text-sm">👥 Field Representatives</span>
                  <button onClick={() => setActiveTab("workforce")} className="text-xs text-indigo-700 font-bold hover:underline">
                    Inspect →
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Medical Reps (MRs):</span>
                    <span className="font-bold text-ink">{summary.totalEmployees} Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Field Follow-up Tasks:</span>
                    <span className="font-bold text-ink">{summary.totalTasks} Assigned</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Tasks Completed:</span>
                    <span className="font-bold text-emerald-700">{summary.completedTasks} Done</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Pending Field Actions:</span>
                    <span className="font-bold text-indigo-700">{summary.pendingTasks} Pending</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-line text-[11px] text-ink-faint">
                Task completion rate: <strong>{summary.taskCompletionRate}%</strong>
              </div>
            </div>

            {/* Box 4: Leads & Telephony Health */}
            <div className="rounded-3xl p-5 neo-panel flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="font-bold text-ink text-sm">📞 Telephony & Pipeline</span>
                  <button onClick={() => setActiveTab("telephony")} className="text-xs text-rose-700 font-bold hover:underline">
                    Inspect →
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Total Pipeline Leads:</span>
                    <span className="font-bold text-ink">{summary.totalLeads} Leads</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Calls Logged:</span>
                    <span className="font-bold text-ink">{summary.totalCalls} Calls</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Missed Calls:</span>
                    <span className="font-bold text-rose-700">{summary.missedCalls} ({summary.missedCallRate}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">WhatsApp Dispatched:</span>
                    <span className="font-bold text-emerald-700">{summary.whatsappSentCount} Messages</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-line text-[11px] text-ink-faint">
                Conversion win rate: <strong>{summary.overallConversionRate}%</strong>
              </div>
            </div>
          </div>

          {/* Marg ERP Ledger Terms Overview */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 gap-3">
              <div>
                <h2 className="font-black text-ink text-base">Marg ERP 9+ Credit Ledger Reconciliation</h2>
                <p className="text-xs text-ink-faint mt-0.5">
                  15, 30, 45, 60+ days payment terms breakdown across PCD franchisees and private label contract accounts
                </p>
              </div>
              <button
                onClick={() => setActiveTab("ledger")}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                View Detailed Schedule & Aging →
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.creditTermStats.map((term) => (
                <div key={term.term} className="rounded-2xl p-4 neo-pressed border border-line bg-white/70">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-ink">{term.label}</span>
                    <span className="text-[11px] font-bold text-ink-faint">{term.count} Invoices</span>
                  </div>
                  <p className="mt-3 text-xl font-black text-ink">{formatINR(term.total)}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-ink-faint">Balance Due:</span>
                    <span className="font-bold text-rose-700">{formatINR(term.balance)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${term.collectionPct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-right text-emerald-700 font-bold">{term.collectionPct}% Collected</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PCD PHARMA FRANCHISE INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === "pcd" && (
        <div className="space-y-8">
          {/* PCD KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-primary">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Active Franchisees</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalPcdClients}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Distributors across states</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-emerald-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">New Parties Acquired</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">+{summary.newPcdClientsMonth}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Onboarded in last 30 days</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-indigo-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Franchise Queries</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalPcdLeads}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Inbound pipeline till now</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-teal-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Franchise Win Rate</p>
              <p className="text-2xl font-black text-teal-700 mt-1">{summary.pcdConversionRate}%</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{summary.convertedPcdLeads} signed agreements</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-purple-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Monopoly Coverage</p>
              <p className="text-2xl font-black text-purple-700 mt-1">{summary.monopolyCoverageRate}%</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{summary.allottedTerritoriesCount}/{summary.totalTerritoriesCount} target districts</p>
            </div>
          </div>

          {/* PCD Channels Breakdown & Territory Allotment Grid */}
          <div className="grid gap-7 lg:grid-cols-[1fr_1.2fr]">
            {/* Channel Funnel Table */}
            <div className="rounded-3xl p-6 neo-panel">
              <div className="border-b border-line pb-4">
                <h3 className="font-bold text-ink text-base">PCD Inquiry Channel Performance</h3>
                <p className="text-xs text-ink-faint mt-0.5">Queries received till now by marketing source and conversion to distributors</p>
              </div>

              <div className="mt-5 space-y-4">
                {data.pcdChannelStats.map((ch) => (
                  <div key={ch.source} className="rounded-2xl p-3.5 neo-pressed border border-line bg-white/60">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-ink">{ch.label}</span>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                        {ch.winRate}% Win Rate
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                      <span>Total Inquiries: <strong>{ch.count}</strong></span>
                      <span>Converted Parties: <strong>{ch.converted}</strong></span>
                      <span>Share: <strong>{ch.pctOfDivision}%</strong></span>
                    </div>
                    <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(ch.pctOfDivision, 6)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exclusive Territory Allotment Status */}
            <div className="rounded-3xl p-6 neo-panel">
              <div className="border-b border-line pb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-ink text-base">Monopoly Territory Registry</h3>
                  <p className="text-xs text-ink-faint mt-0.5">District exclusivity allocation for PCD franchise partners</p>
                </div>
                <Link href="/admin/territories" className="text-xs font-bold text-primary hover:underline">
                  Manage Territories →
                </Link>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                    <tr>
                      <th className="pb-3">Territory</th>
                      <th className="pb-3">Monopoly Status</th>
                      <th className="pb-3">Assigned Party</th>
                      <th className="pb-3 text-right">Marg Billed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {data.territories.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="py-3 font-bold text-ink">
                          {t.city}, <span className="text-ink-faint font-normal">{t.state}</span>
                        </td>
                        <td className="py-3">
                          {t.isAllotted ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                              Exclusively Allotted
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                              Vacant / Open District
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-ink-muted font-medium">{t.partyName}</td>
                        <td className="py-3 text-right font-bold text-ink">
                          {t.totalRevenue > 0 ? formatINR(t.totalRevenue) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Active PCD Franchise Parties Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Active PCD Franchise Partners</h3>
                <p className="text-xs text-ink-faint mt-0.5">Billed turnover, reorder cadence adherence, and exclusive districts</p>
              </div>
              <Link href="/admin/clients" className="text-xs font-bold text-primary hover:underline">
                All Clients Directory →
              </Link>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Franchise Party</th>
                    <th className="pb-3">District / Territory</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Cadence</th>
                    <th className="pb-3">Orders</th>
                    <th className="pb-3 text-right">Marg Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.pcdClients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">
                        {client.name}
                        {client.isRepeatCustomer && (
                          <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                            Repeat
                          </span>
                        )}
                        <p className="text-[10px] text-ink-faint font-normal">{client.companyDetails || "—"}</p>
                      </td>
                      <td className="py-3 font-medium text-ink-muted">{client.territory}</td>
                      <td className="py-3 text-ink-muted">{client.phoneNumber || "—"}</td>
                      <td className="py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-muted">{client.cadence}</span>
                      </td>
                      <td className="py-3 font-semibold text-ink">{client.ordersCount} dispatches</td>
                      <td className="py-3 text-right font-black text-ink">{formatINR(client.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent PCD Franchise Inquiries Log */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">PCD Franchise Inquiries Log (Till Now)</h3>
                <p className="text-xs text-ink-faint mt-0.5">Inbound franchisee applicants, target expansion districts, and conversion stage</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search inquiries or districts..."
                  value={pcdSearch}
                  onChange={(e) => setPcdSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary w-56"
                />
                <Link href="/admin/leads" className="text-xs font-bold text-primary hover:underline whitespace-nowrap">
                  Lead Center →
                </Link>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Applicant Name</th>
                    <th className="pb-3">Target Territory</th>
                    <th className="pb-3">Source</th>
                    <th className="pb-3">Stage</th>
                    <th className="pb-3">Inquiry Requirements</th>
                    <th className="pb-3 text-right">Received Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredPcdInquiries.map((inq) => (
                    <tr key={inq.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <p className="font-bold text-ink">{inq.name}</p>
                        <p className="text-[10px] text-ink-faint">{inq.phoneNumber || "—"}</p>
                      </td>
                      <td className="py-3 font-semibold text-primary">{inq.targetTerritory}</td>
                      <td className="py-3">
                        <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">{inq.source}</span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            inq.status === "CONVERTED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : inq.status === "INTERESTED"
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : inq.status === "CONTACTED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {inq.status}
                        </span>
                      </td>
                      <td className="py-3 max-w-xs text-ink-muted text-[11px] truncate">
                        {inq.inquiryDetails || "Standard PCD Franchise Application"}
                      </td>
                      <td className="py-3 text-right text-ink-faint">{formatDate(inq.createdAt)}</td>
                    </tr>
                  ))}
                  {filteredPcdInquiries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-ink-faint">
                        No PCD inquiries matching &ldquo;{pcdSearch}&rdquo;
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
      {/* TAB 3: THIRD-PARTY & CONTRACT MANUFACTURING INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === "thirdparty" && (
        <div className="space-y-8">
          {/* Third-Party KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-purple-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Brand Accounts</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalTpClients}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Private label / loan license</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-emerald-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">New Brands Acquired</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">+{summary.newTpClientsMonth}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Commercialized brands</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-indigo-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Contract RFQs</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalTpLeads}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Bulk batch quotations</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-primary">
              <p className="text-[11px] font-bold text-ink-faint uppercase">RFQ Win Rate</p>
              <p className="text-2xl font-black text-primary mt-1">{summary.tpConversionRate}%</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{summary.convertedTpLeads} brands billing</p>
            </div>
            <div className="rounded-2xl p-4 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Contract Turnover</p>
              <p className="text-2xl font-black text-ink mt-1">{formatINR(summary.tpRevenue)}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">From Marg / Busy batches</p>
            </div>
          </div>

          {/* Dosage Form Production Breakdown */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Bulk Batch Production Volumes by Dosage Form</h3>
                <p className="text-xs text-ink-faint mt-0.5">Marg ERP dispatched quantities and inquiry demand segmented across formulation dosage forms</p>
              </div>
              <span className="rounded-full bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1 text-xs font-bold">
                GMP Certified Production
              </span>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.dosageFormStats.map((df) => (
                <div key={df.dosageForm} className="rounded-2xl p-4 neo-pressed border border-line bg-white/70">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink text-sm">{df.dosageForm}</span>
                    <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                      {df.pctOfTotal}% of Volume
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-ink">
                    {df.totalBoxes.toLocaleString("en-IN")}{" "}
                    <span className="text-xs font-bold text-ink-faint">Boxes</span>
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                    <span>Turnover: <strong>{formatINR(df.totalRevenue)}</strong></span>
                    <span>Order Items: <strong>{df.orderItemsCount}</strong></span>
                  </div>
                  <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-600" style={{ width: `${Math.max(df.pctOfTotal, 8)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint">
                    <span>Third-Party Batches: {df.tpBoxes.toLocaleString("en-IN")}</span>
                    <span>Franchise: {df.pcdBoxes.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Third-Party Contract Brand Accounts */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Contract Manufacturing Brand Accounts</h3>
                <p className="text-xs text-ink-faint mt-0.5">Private label client list with loan licenses, GSTIN, and batch reorder cadence</p>
              </div>
              <Link href="/admin/clients" className="text-xs font-bold text-purple-700 hover:underline">
                Manage Brand Accounts →
              </Link>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Brand Company Name</th>
                    <th className="pb-3">License / GST Details</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Reorder Cadence</th>
                    <th className="pb-3">Dispatched Batches</th>
                    <th className="pb-3">Credit Balance</th>
                    <th className="pb-3 text-right">Marg Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.thirdPartyClients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">
                        {client.name}
                        <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 border border-purple-200">
                          Contract Brand
                        </span>
                      </td>
                      <td className="py-3 text-[11px] text-ink-muted">{client.companyDetails || "—"}</td>
                      <td className="py-3 text-ink-muted">{client.phoneNumber || "—"}</td>
                      <td className="py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-muted">{client.cadence}</span>
                      </td>
                      <td className="py-3 font-semibold text-ink">{client.ordersCount} Batches</td>
                      <td className="py-3 font-bold text-rose-700">
                        {client.creditBalance > 0 ? formatINR(client.creditBalance) : "Nil (Settled)"}
                      </td>
                      <td className="py-3 text-right font-black text-ink">{formatINR(client.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Third-Party RFQ Inquiries Log */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Contract Manufacturing RFQ Inquiries (Till Now)</h3>
                <p className="text-xs text-ink-faint mt-0.5">Bulk batch formulation inquiries, private label tenders, and quotation status</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search brand RFQs..."
                  value={tpSearch}
                  onChange={(e) => setTpSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-purple-600 w-56"
                />
                <Link href="/admin/leads" className="text-xs font-bold text-purple-700 hover:underline whitespace-nowrap">
                  Lead Center →
                </Link>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Brand / Promoter</th>
                    <th className="pb-3">Source</th>
                    <th className="pb-3">Stage</th>
                    <th className="pb-3">Formulation & Batch Requirements</th>
                    <th className="pb-3 text-right">Inquiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredTpInquiries.map((inq) => (
                    <tr key={inq.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <p className="font-bold text-ink">{inq.name}</p>
                        <p className="text-[10px] text-ink-faint">{inq.phoneNumber || "—"}</p>
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-800">{inq.source}</span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            inq.status === "CONVERTED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : inq.status === "INTERESTED"
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : inq.status === "CONTACTED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {inq.status}
                        </span>
                      </td>
                      <td className="py-3 max-w-md text-ink-muted text-[11px]">
                        {inq.inquiryDetails || "Bulk Private Label Batch Formulation"}
                      </td>
                      <td className="py-3 text-right text-ink-faint">{formatDate(inq.createdAt)}</td>
                    </tr>
                  ))}
                  {filteredTpInquiries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-faint">
                        No contract manufacturing inquiries matching &ldquo;{tpSearch}&rdquo;
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
      {/* TAB 4: STOCK IQ & WAREHOUSE INVENTORY INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === "stock" && (
        <div className="space-y-8">
          {/* Stock Metrics Banner */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Catalog Inventory</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalSkus} SKUs</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.totalStockBoxes.toLocaleString("en-IN")} Total Boxes in Warehouse</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Stock Valuation (At Rate)</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{formatINR(summary.totalInventoryCost)}</p>
              <p className="text-xs text-ink-muted mt-0.5">MRP Value: {formatINR(summary.totalInventoryMrp)}</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Critical Low Stock</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{summary.lowStockCount} Products</p>
              <p className="text-xs text-ink-muted mt-0.5">At or below reorder threshold</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-purple-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Active PO Alerts</p>
              <p className="text-2xl font-black text-purple-700 mt-1">{summary.activePoAlertsCount} Alerts</p>
              <p className="text-xs text-ink-muted mt-0.5">Purchase orders pending dispatch</p>
            </div>
          </div>

          {/* Low Stock Reorder Priority Table */}
          <div className="rounded-3xl p-6 neo-panel border-l-4 border-l-rose-500">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="font-bold text-ink text-base">Critical Low Stock & Reorder Requirements</h3>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">Formulations below safety buffers that will trigger franchise supply disruptions</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search low stock SKUs..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 w-56"
                />
                <Link href="/admin/stock-iq" className="text-xs font-bold text-rose-700 hover:underline whitespace-nowrap">
                  Open Stock IQ →
                </Link>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Product Name & SKU</th>
                    <th className="pb-3">Dosage Form</th>
                    <th className="pb-3">Current Stock</th>
                    <th className="pb-3">Safety Threshold</th>
                    <th className="pb-3">Shortage Deficit</th>
                    <th className="pb-3">PO Status</th>
                    <th className="pb-3 text-right">Billed Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredLowStock.map((p) => (
                    <tr key={p.id} className="hover:bg-rose-50/20">
                      <td className="py-3 font-bold text-ink">
                        {p.name}
                        <p className="text-[10px] font-mono text-ink-faint">{p.sku}</p>
                      </td>
                      <td className="py-3 text-ink-muted">{p.dosageForm || "—"}</td>
                      <td className="py-3 font-bold text-rose-700">{p.stockQty} Boxes</td>
                      <td className="py-3 text-ink-muted">{p.reorderThreshold} Boxes</td>
                      <td className="py-3">
                        <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                          -{p.deficit} Boxes Short
                        </span>
                      </td>
                      <td className="py-3">
                        {p.hasPoAlert ? (
                          <span className="rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px] font-bold border border-purple-200">
                            PO Triggered
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                            Action Needed
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-bold text-ink">{formatINR(p.rate)}</td>
                    </tr>
                  ))}
                  {filteredLowStock.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-emerald-700 font-bold">
                        🎉 All warehouse products are currently above minimum safety reorder thresholds!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warehouse Near-Expiry Clearance Engine */}
          <div className="rounded-3xl p-6 neo-panel border-l-4 border-l-amber-500">
            <div className="border-b border-line pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏳</span>
                  <h3 className="font-bold text-ink text-base">Warehouse Stock Expiry Clearance Engine</h3>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">Near-expiry batches requiring distributor clearance schemes before expiration</p>
              </div>
              <span className="text-xs font-bold text-amber-800">
                Capital Exposure: {formatINR(summary.capitalAtExpiryRisk)}
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Product Name & SKU</th>
                    <th className="pb-3">Dosage Form</th>
                    <th className="pb-3">Batch Number</th>
                    <th className="pb-3">Stock Boxes</th>
                    <th className="pb-3">Expiry Date</th>
                    <th className="pb-3">Days Remaining</th>
                    <th className="pb-3 text-right">Capital Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.nearExpiryProducts.map((p) => (
                    <tr key={p.id} className={p.isCritical ? "bg-rose-50/40" : "hover:bg-amber-50/30"}>
                      <td className="py-3 font-bold text-ink">
                        {p.name}
                        <p className="text-[10px] font-mono text-ink-faint">{p.sku}</p>
                      </td>
                      <td className="py-3 text-ink-muted">{p.dosageForm || "—"}</td>
                      <td className="py-3 font-mono font-bold text-ink">{p.batchNumber || "—"}</td>
                      <td className="py-3 font-semibold text-ink">{p.stockQty} Boxes</td>
                      <td className="py-3 text-ink-muted">{formatDate(p.expiryDate)}</td>
                      <td className="py-3">
                        {p.isCritical ? (
                          <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                            {p.daysRemaining} Days (Critical)
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                            {p.daysRemaining} Days (Warning)
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-black text-rose-700">{formatINR(p.capitalAtRisk)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: REORDERS & REPLENISHMENT INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === "reorders" && (
        <div className="space-y-8">
          {/* Reorders KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-teal-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Active Reordering Parties</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.activeReorderClients} Clients</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.repeatPcdRate}% Network retention rate</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Reorders Due Now (≤3d)</p>
              <p className="text-2xl font-black text-primary mt-1">{summary.reordersDueNowCount} Accounts</p>
              <p className="text-xs text-ink-muted mt-0.5">Immediate replenishment pipeline</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Cadence Delayed Beyond Window</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{summary.cadenceDelayedCount} Accounts</p>
              <p className="text-xs text-ink-muted mt-0.5">Delayed beyond agreed order cycle</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Network Order Interval</p>
              <p className="text-2xl font-black text-ink mt-1">~{summary.avgCadenceIntervalDays} Days</p>
              <p className="text-xs text-ink-muted mt-0.5">Average replenishment cycle</p>
            </div>
          </div>

          {/* Client Cadence Schedule Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Client Monthly Reorder Cadence Schedule</h3>
                <p className="text-xs text-ink-faint mt-0.5">Tracks days elapsed since last billing, assigned medical representative, and routine product basket</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search client or MR..."
                  value={reorderSearch}
                  onChange={(e) => setReorderSearch(e.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-teal-600 w-56"
                />
                <Link href="/admin/reorders" className="text-xs font-bold text-teal-700 hover:underline whitespace-nowrap">
                  Open Reorders →
                </Link>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Client Name</th>
                    <th className="pb-3">Territory Area</th>
                    <th className="pb-3">Assigned MR</th>
                    <th className="pb-3">Typical Cadence</th>
                    <th className="pb-3">Last Billed</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Routine SKUs</th>
                    <th className="pb-3 text-right">Lifetime Marg Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredCadence.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">{r.name}</td>
                      <td className="py-3 font-medium text-ink-muted">{r.territory}</td>
                      <td className="py-3 font-medium text-primary">{r.mrName}</td>
                      <td className="py-3 text-ink-muted">~{r.avgInterval} Days (Day {r.typicalOrderDay})</td>
                      <td className="py-3 text-ink-faint">{r.daysSinceLastOrder} days ago</td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            r.cadenceStatus === "DELAYED"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : r.cadenceStatus === "DUE_NOW"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : r.cadenceStatus === "APPROACHING"
                              ? "bg-sky-50 text-sky-800 border-sky-200"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200"
                          }`}
                        >
                          {r.cadenceStatus === "DELAYED" && "Cadence Delayed"}
                          {r.cadenceStatus === "DUE_NOW" && "Due Now (≤3d)"}
                          {r.cadenceStatus === "APPROACHING" && "Approaching"}
                          {r.cadenceStatus === "HEALTHY" && "Healthy Cycle"}
                        </span>
                      </td>
                      <td className="py-3 font-semibold text-ink">{r.routineProductsCount} Products</td>
                      <td className="py-3 text-right font-black text-ink">{formatINR(r.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: FIELD WORKFORCE & MR PERFORMANCE */}
      {/* ========================================================================= */}
      {activeTab === "workforce" && (
        <div className="space-y-8">
          {/* Workforce KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Active Field Force</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalEmployees} MRs</p>
              <p className="text-xs text-ink-muted mt-0.5">Medical Reps & Area Managers</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Follow-up Tasks</p>
              <p className="text-2xl font-black text-primary mt-1">{summary.totalTasks} Assigned</p>
              <p className="text-xs text-ink-muted mt-0.5">Client & inquiry follow-ups</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Tasks Completed</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{summary.completedTasks} Done</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.taskCompletionRate}% Execution rate</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Pending Field Actions</p>
              <p className="text-2xl font-black text-amber-700 mt-1">{summary.pendingTasks} Pending</p>
              <p className="text-xs text-ink-muted mt-0.5">Active tasks in field queue</p>
            </div>
          </div>

          {/* Representative Performance Scorecard Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Medical Representative (MR) Performance Scorecard</h3>
                <p className="text-xs text-ink-faint mt-0.5">Sales contribution, assigned client accounts, inquiries handled, and task completion</p>
              </div>
              <Link href="/admin/employees" className="text-xs font-bold text-indigo-700 hover:underline">
                Manage Employees →
              </Link>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Representative Name</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Assigned Clients</th>
                    <th className="pb-3">Pipeline Leads</th>
                    <th className="pb-3">Tasks (Done / Total)</th>
                    <th className="pb-3">Execution Rate</th>
                    <th className="pb-3 text-right">Marg Billed Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.employeePerformanceRows.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          className="text-ink hover:text-primary hover:underline flex items-center gap-1 group"
                        >
                          <span>{emp.name}</span>
                          <span className="text-primary text-xs opacity-0 group-hover:opacity-100 transition">→</span>
                        </Link>
                      </td>
                      <td className="py-3 text-ink-muted">{emp.phoneNumber}</td>
                      <td className="py-3 font-semibold text-primary">{emp.clientsCount} Accounts</td>
                      <td className="py-3 font-medium text-ink-muted">{emp.leadsCount} Inquiries</td>
                      <td className="py-3 text-ink-muted">
                        <span className="font-bold text-emerald-700">{emp.completedTasksCount}</span> / {emp.completedTasksCount + emp.pendingTasksCount}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${emp.taskCompletionRate}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-ink-muted">{emp.taskCompletionRate}%</span>
                        </div>
                      </td>
                      <td className="py-3 text-right font-black text-ink">{formatINR(emp.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Field Follow-up Tasks Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Active Field Follow-up Tasks Queue</h3>
                <p className="text-xs text-ink-faint mt-0.5">Real-time delegation queue assigned by management to field representatives</p>
              </div>

              <input
                type="text"
                placeholder="Search tasks or reps..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-indigo-600 w-56"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Task Title & Details</th>
                    <th className="pb-3">Party Name</th>
                    <th className="pb-3">Assigned MR</th>
                    <th className="pb-3">Task Type</th>
                    <th className="pb-3">Priority</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Target Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="py-3 max-w-sm">
                        <p className="font-bold text-ink">{t.title}</p>
                        <p className="text-[10px] text-ink-faint">{t.description || "—"}</p>
                      </td>
                      <td className="py-3 font-semibold text-primary">{t.clientName}</td>
                      <td className="py-3 font-medium text-ink-muted">{t.repName}</td>
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
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
                      <td colSpan={7} className="py-8 text-center text-ink-faint">
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

      {/* ========================================================================= */}
      {/* TAB 7: LEADS & TELEPHONY OPERATIONS */}
      {/* ========================================================================= */}
      {activeTab === "telephony" && (
        <div className="space-y-8">
          {/* Telephony KPI Ribbon */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-rose-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Total Pipeline Leads</p>
              <p className="text-2xl font-black text-ink mt-1">{summary.totalLeads}</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.convertedLeads} converted till now</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-primary">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Calls Logged</p>
              <p className="text-2xl font-black text-primary mt-1">{summary.totalCalls}</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.outboundCalls} Out • {summary.inboundCalls} In</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-amber-500">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Missed Calls</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{summary.missedCalls}</p>
              <p className="text-xs text-ink-muted mt-0.5">{summary.missedCallRate}% Missed rate</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">WhatsApp Dispatched</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{summary.whatsappSentCount}</p>
              <p className="text-xs text-ink-muted mt-0.5">Catalogs & price lists sent</p>
            </div>
            <div className="rounded-2xl p-5 neo-panel border-t-2 border-t-indigo-600">
              <p className="text-[11px] font-bold text-ink-faint uppercase">Overall Conversion</p>
              <p className="text-2xl font-black text-indigo-700 mt-1">{summary.overallConversionRate}%</p>
              <p className="text-xs text-ink-muted mt-0.5">Inquiry to billed customer</p>
            </div>
          </div>

          {/* Lead Pipeline Stages Distribution */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4">
              <h3 className="font-bold text-ink text-base">Inquiry Pipeline Progression Stages</h3>
              <p className="text-xs text-ink-faint mt-0.5">Distribution of all inquiries received across CRM conversion milestones</p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {data.leadStageStats.map((st) => (
                <div key={st.stage} className="rounded-2xl p-4 neo-pressed border border-line bg-white/70">
                  <span className="text-xs font-bold text-ink-muted">{st.label}</span>
                  <p className="mt-2 text-2xl font-black text-ink">{st.count}</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${st.pctOfTotal}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-right text-ink-faint">{st.pctOfTotal}% of pipeline</p>
                </div>
              ))}
            </div>
          </div>

          {/* Telephony Operations & Call Activity Log Table */}
          <div className="rounded-3xl p-6 neo-panel">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink text-base">Telephony Operations & Call Log</h3>
                <p className="text-xs text-ink-faint mt-0.5">Tracks representative conversations, call direction, behavioral interest, and WhatsApp delivery</p>
              </div>

              <input
                type="text"
                placeholder="Search call logs..."
                value={callSearch}
                onChange={(e) => setCallSearch(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-rose-500 w-56"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Representative</th>
                    <th className="pb-3">Contact Party / Lead</th>
                    <th className="pb-3">Direction</th>
                    <th className="pb-3">Call Status</th>
                    <th className="pb-3">Conversation Summary & Tags</th>
                    <th className="pb-3">WhatsApp Sent</th>
                    <th className="pb-3 text-right">Call Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredCalls.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-ink">{c.repName}</td>
                      <td className="py-3">
                        <span className="font-bold text-primary">{c.targetName}</span>
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">
                          {c.targetType}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                          {c.direction}
                        </span>
                      </td>
                      <td className="py-3">
                        {c.missed ? (
                          <span className="rounded-full bg-rose-100 text-rose-800 px-2.5 py-0.5 text-[10px] font-bold">
                            Missed Call
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-0.5 text-[10px] font-bold border border-emerald-200">
                            Connected
                          </span>
                        )}
                      </td>
                      <td className="py-3 max-w-md">
                        <p className="text-ink-muted text-[11px]">{c.summary || "Call logged without notes."}</p>
                        {c.behaviorTags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.behaviorTags.map((tag) => (
                              <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-ink-muted">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        {c.whatsappSent ? (
                          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                            ✓ Dispatched
                          </span>
                        ) : (
                          <span className="text-ink-faint text-[10px]">No</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-ink-faint">{formatDate(c.occurredAt)}</td>
                    </tr>
                  ))}
                  {filteredCalls.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-faint">
                        No calls matching &ldquo;{callSearch}&rdquo;
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
      {/* TAB 8: MARG ERP CREDIT LEDGER & RECEIVABLES */}
      {/* ========================================================================= */}
      {activeTab === "ledger" && (
        <div className="space-y-8">
          {/* Credit Aging Breakdown Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.creditTermStats.map((term) => (
              <div key={term.term} className="rounded-2xl p-5 neo-panel border-t-2 border-t-emerald-600">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                    {term.label} Term
                  </span>
                  <span className="text-xs font-semibold text-ink-faint">{term.count} Invoices</span>
                </div>
                <p className="mt-3 text-2xl font-black text-ink">{formatINR(term.total)}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-ink-faint">Balance Due:</span>
                  <span className="font-bold text-rose-700">{formatINR(term.balance)}</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${term.collectionPct}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-right font-bold text-emerald-700">{term.collectionPct}% Collected</p>
              </div>
            ))}
          </div>

          {/* Overdue Receivables Alert Table */}
          <div className="rounded-3xl p-6 neo-panel border-l-4 border-l-rose-500">
            <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="font-bold text-ink text-base">Overdue Receivables Ledger (Past Terms)</h3>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">Invoices exceeding agreed 15/30/45/60 day terms requiring recovery intervention</p>
              </div>
              <span className="rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1 text-xs font-bold">
                {summary.overdueCount} Overdue Accounts ({formatINR(summary.overdueAmount)})
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-ink-faint uppercase font-bold text-[10px]">
                  <tr>
                    <th className="pb-3">Party Name</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Invoice No</th>
                    <th className="pb-3">Credit Term</th>
                    <th className="pb-3">Due Date</th>
                    <th className="pb-3">Overdue Days</th>
                    <th className="pb-3">Total Amount</th>
                    <th className="pb-3 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {data.overdueRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-rose-50/30">
                      <td className="py-3 font-bold text-ink">
                        {rec.partyName}
                        <p className="text-[10px] text-ink-faint font-normal">{rec.phoneNumber || "—"}</p>
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                          {rec.businessType === "THIRD_PARTY" ? "Third-Party" : "PCD Franchise"}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-bold text-primary">{rec.invoiceNumber}</td>
                      <td className="py-3">{rec.daysAsked} Days</td>
                      <td className="py-3 text-ink-muted">{formatDate(rec.dueDate)}</td>
                      <td className="py-3">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                          {rec.daysOverdue} Days Past Due
                        </span>
                      </td>
                      <td className="py-3 text-ink-muted">{formatINR(rec.totalAmount)}</td>
                      <td className="py-3 text-right font-black text-rose-700">{formatINR(rec.balanceAmount)}</td>
                    </tr>
                  ))}
                  {data.overdueRecords.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-emerald-700 font-bold">
                        🎉 All client invoices are currently within agreed credit terms!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
