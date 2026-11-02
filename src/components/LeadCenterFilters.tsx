"use client";

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface EmployeeOption {
  id: string;
  name: string;
  leadsCount: number;
}

interface LeadCenterFiltersProps {
  employees: EmployeeOption[];
  unassignedCount: number;
  currentEmployeeId?: string;
  currentStatus?: string;
  unassignedOnly?: boolean;
}

export function LeadCenterFilters({
  employees,
  unassignedCount,
  currentEmployeeId = "",
  currentStatus = "all",
  unassignedOnly = false,
}: LeadCenterFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine current employee value
  const employeeValue = unassignedOnly ? "unassigned" : currentEmployeeId || "all";
  const statusValue = currentStatus || "all";

  function updateQuery(key: string, value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page"); // Reset to page 1 on filter change

    if (key === "employee") {
      if (value === "all") {
        sp.delete("employeeId");
        sp.delete("unassigned");
      } else if (value === "unassigned") {
        sp.delete("employeeId");
        sp.set("unassigned", "1");
      } else {
        sp.delete("unassigned");
        sp.set("employeeId", value);
      }
    } else if (key === "status") {
      if (value === "all") {
        sp.delete("status");
      } else {
        sp.set("status", value);
      }
    }

    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      {/* 1. Representative / Employee Filter */}
      <div className="relative min-w-[170px] sm:min-w-[190px]">
        <select
          value={employeeValue}
          onChange={(e) => updateQuery("employee", e.target.value)}
          aria-label="Filter by sales representative"
          className="w-full appearance-none rounded-xl border border-line bg-white pl-3 pr-8 py-1.5 text-xs font-bold text-ink shadow-2xs hover:border-teal-500/50 hover:bg-slate-50/80 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          <option value="all">👤 All Representatives ({employees.length})</option>
          <option value="unassigned">⚠️ Unassigned Leads ({unassignedCount})</option>
          <optgroup label="Assigned Team Members">
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                👤 {emp.name} ({emp.leadsCount} leads)
              </option>
            ))}
          </optgroup>
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
          ▼
        </span>
      </div>

      {/* 2. Status / Outcome Filter */}
      <div className="relative min-w-[160px] sm:min-w-[180px]">
        <select
          value={statusValue}
          onChange={(e) => updateQuery("status", e.target.value)}
          aria-label="Filter by lead status"
          className="w-full appearance-none rounded-xl border border-line bg-white pl-3 pr-8 py-1.5 text-xs font-bold text-ink shadow-2xs hover:border-teal-500/50 hover:bg-slate-50/80 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          <option value="all">🎯 All Statuses / Stages</option>
          <option value="NEW">✨ New Leads (Fresh)</option>
          <option value="ASSIGNED">📌 Assigned</option>
          <option value="CONTACTED">📞 Contacted</option>
          <option value="INTERESTED">🔥 Interested / Follow-up</option>
          <option value="CONVERTED">🟣 Converted</option>
          <option value="NOT_INTERESTED">🔴 Dead / Closed</option>
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
          ▼
        </span>
      </div>
    </div>
  );
}
