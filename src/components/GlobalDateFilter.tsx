"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardDatePreset } from "@/lib/date-filters";

export function GlobalDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const rangeParam = (searchParams.get("range") as DashboardDatePreset) || "all_time";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";

  const [selectedPreset, setSelectedPreset] = useState<DashboardDatePreset>(rangeParam);
  const [fromDate, setFromDate] = useState<string>(fromParam);
  const [toDate, setToDate] = useState<string>(toParam);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);

  const customModalRef = useRef<HTMLDivElement>(null);

  // Sync state when URL params change
  useEffect(() => {
    setSelectedPreset(rangeParam);
    setFromDate(fromParam);
    setToDate(toParam);
  }, [rangeParam, fromParam, toParam]);

  // Click outside listener to close custom date modal
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customModalRef.current && !customModalRef.current.contains(event.target as Node)) {
        setShowCustomModal(false);
      }
    }
    if (showCustomModal) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCustomModal]);

  function handleSelectPreset(val: DashboardDatePreset) {
    setSelectedPreset(val);

    if (val === "custom") {
      setShowCustomModal(true);
      return;
    }

    setShowCustomModal(false);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (val === "all_time") {
        params.delete("range");
        params.delete("from");
        params.delete("to");
      } else {
        params.set("range", val);
        params.delete("from");
        params.delete("to");
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function handleApplyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate && !toDate) return;

    setShowCustomModal(false);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", "custom");
      if (fromDate) params.set("from", fromDate);
      else params.delete("from");
      if (toDate) params.set("to", toDate);
      else params.delete("to");

      const qs = params.toString();
      router.push(`${pathname}?${qs}`);
    });
  }

  return (
    <div className="relative inline-flex items-center">
      {/* Exact Pill Capsule Matching User Screenshot */}
      <div className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-white px-2.5 sm:px-3 py-1 border border-line shadow-xs hover:border-[#0284c7]/40 transition">
        {/* Calendar Icon in CRM Blue */}
        <span className="flex items-center gap-1 sm:gap-1.5 text-xs font-bold text-ink shrink-0 select-none">
          <svg
            className="h-4 w-4 text-[#0284c7]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-ink font-bold hidden sm:inline">Date:</span>
        </span>

        {/* Inner Select Pill */}
        <div className="relative flex items-center">
          <select
            value={selectedPreset}
            onChange={(e) => handleSelectPreset(e.target.value as DashboardDatePreset)}
            disabled={isPending}
            aria-label="Select date range filter"
            className="rounded-full bg-slate-50/90 hover:bg-slate-100 pl-2.5 pr-6 sm:pl-3 sm:pr-7 py-0.5 sm:py-1 text-xs font-bold text-slate-800 border border-line/80 focus:border-[#0284c7] focus:outline-hidden cursor-pointer appearance-none disabled:opacity-50 transition"
          >
            <option value="all_time">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_week">Last Week</option>
            <option value="last_month">Last Month</option>
            <option value="this_month">This Month</option>
            <option value="custom">Custom Range...</option>
          </select>

          {/* Custom Chevron Down Icon */}
          <svg
            className="pointer-events-none absolute right-2 sm:right-2.5 h-3.5 w-3.5 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {isPending && (
          <span className="flex h-3 w-3 animate-spin rounded-full border-2 border-[#0284c7] border-t-transparent ml-0.5" />
        )}
      </div>

      {/* Custom Range Popover */}
      {showCustomModal && (
        <div
          ref={customModalRef}
          className="fixed inset-x-4 top-24 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-72 max-w-[calc(100vw-32px)] rounded-2xl bg-white p-4 shadow-xl border border-line animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-line">
            <span className="text-xs font-bold text-ink">Custom Date Range</span>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-xs text-ink-faint hover:text-ink cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleApplyCustom} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-ink-muted mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-ink border border-line focus:border-[#0284c7] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink-muted mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-ink border border-line focus:border-[#0284c7] focus:outline-hidden"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-ink-muted hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!fromDate && !toDate}
                className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white px-3 py-1.5 text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
