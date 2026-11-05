"use client";

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface EmployeePipelineSelectProps {
  followUpFilter: string;
  totalLeads: number;
  freshCount: number;
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
}

export function EmployeePipelineSelect({
  followUpFilter,
  totalLeads,
  freshCount,
  overdueCount,
  todayCount,
  upcomingCount,
}: EmployeePipelineSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page"); // Reset to page 1 on filter change

    if (value === "all") {
      sp.delete("followUp");
    } else {
      sp.set("followUp", value);
    }

    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="relative min-w-[180px] sm:min-w-[210px]">
      <select
        value={followUpFilter || "all"}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Filter by follow-up and pipeline stage"
        className="w-full appearance-none rounded-xl border border-line bg-white pl-3.5 pr-8 py-2 text-xs font-bold text-ink shadow-2xs hover:border-teal-500/50 hover:bg-slate-50/80 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
      >
        <option value="all">🎯 All Pipeline ({totalLeads})</option>
        <option value="fresh">✨ Fresh Leads ({freshCount})</option>
        <option value="due">⏰ Due now ({overdueCount + todayCount})</option>
        <option value="overdue">🔴 Overdue ({overdueCount})</option>
        <option value="today">📅 Today ({todayCount})</option>
        <option value="upcoming">🗓️ Upcoming ({upcomingCount})</option>
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
        ▼
      </span>
    </div>
  );
}
