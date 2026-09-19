"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardDatePreset } from "@/lib/date-filters";

interface AdminDashboardDateFilterProps {
  currentPreset: DashboardDatePreset;
  activeLabel: string;
  customFrom?: string;
  customTo?: string;
}

export function AdminDashboardDateFilter({
  currentPreset,
  activeLabel,
  customFrom = "",
  customTo = "",
}: AdminDashboardDateFilterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedPreset, setSelectedPreset] = useState<DashboardDatePreset>(currentPreset);
  const [fromDate, setFromDate] = useState<string>(customFrom);
  const [toDate, setToDate] = useState<string>(customTo);
  const [showCustomInputs, setShowCustomInputs] = useState<boolean>(currentPreset === "custom");

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as DashboardDatePreset;
    setSelectedPreset(val);

    if (val === "custom") {
      setShowCustomInputs(true);
      return;
    }

    setShowCustomInputs(false);
    startTransition(() => {
      if (val === "all_time") {
        router.push("/admin");
      } else {
        router.push(`/admin?range=${val}`);
      }
    });
  }

  function handleApplyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate && !toDate) return;

    startTransition(() => {
      const params = new URLSearchParams();
      params.set("range", "custom");
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      router.push(`/admin?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
      <div className="flex items-center gap-2 rounded-2xl bg-white/90 p-1.5 pl-3 border border-line shadow-xs neo-panel-soft">
        <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted shrink-0">
          <svg
            className="h-4 w-4 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="hidden md:inline">Date:</span>
        </span>

        {/* Small Dropdown */}
        <select
          value={selectedPreset}
          onChange={handleSelectChange}
          disabled={isPending}
          aria-label="Filter dashboard by date range"
          className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-ink border border-line/80 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary/30 transition cursor-pointer disabled:opacity-50"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last_week">Last Week</option>
          <option value="last_month">Last Month</option>
          <option value="this_month">This Month</option>
          <option value="all_time">All Time</option>
          <option value="custom">Custom Range...</option>
        </select>

        {isPending && (
          <span className="flex h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent mr-1" />
        )}
      </div>

      {/* Custom Date Pickers when Custom is selected */}
      {showCustomInputs && (
        <form
          onSubmit={handleApplyCustom}
          className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 px-2.5 border border-primary/40 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-ink-faint uppercase">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-semibold text-ink border border-line focus:outline-hidden focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-ink-faint uppercase">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-semibold text-ink border border-line focus:outline-hidden focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-gradient-to-r from-primary to-indigo-600 px-3 py-1 text-xs font-extrabold text-white shadow-xs hover:opacity-95 active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
