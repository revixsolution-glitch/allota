"use client";

import { useTransition } from "react";
import { updateLead } from "@/lib/admin-actions";

interface EmployeeOption {
  id: string;
  name: string;
}

export function LeadRepSelect({
  leadId,
  leadStatus,
  assignedEmployeeId,
  employees,
  assignedEmployeeName,
  className = "w-full max-w-[145px]",
}: {
  leadId: string;
  leadStatus: string;
  assignedEmployeeId?: string | null;
  employees: EmployeeOption[];
  assignedEmployeeName?: string | null;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const isAssigned = Boolean(assignedEmployeeId);

  return (
    <form
      action={updateLead}
      className={`relative inline-flex items-center ${className}`}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="status" value={leadStatus} />
      <select
        key={`${leadId}-${assignedEmployeeId ?? "none"}`}
        name="assignedEmployeeId"
        defaultValue={assignedEmployeeId ?? ""}
        disabled={isPending}
        onChange={(e) => {
          startTransition(() => {
            e.currentTarget.form?.requestSubmit();
          });
        }}
        aria-label="Assign Representative"
        className={`w-full h-8 rounded-lg border pl-2.5 pr-7 text-xs font-semibold cursor-pointer appearance-none transition focus:outline-none focus:ring-1 focus:ring-primary truncate ${
          isPending ? "opacity-60 pointer-events-none" : ""
        } ${
          isAssigned
            ? "border-line bg-white text-ink shadow-2xs hover:border-slate-300"
            : "border-rose-300 bg-rose-50/80 text-rose-800 font-bold hover:bg-rose-100/70"
        }`}
      >
        <option value="">Unassigned</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
        {assignedEmployeeName && !employees.some((e) => e.id === assignedEmployeeId) && (
          <option value={assignedEmployeeId!}>{assignedEmployeeName}</option>
        )}
      </select>
      <span className="pointer-events-none absolute right-2 text-[10px] text-ink-muted">
        {isPending ? "⏳" : "▾"}
      </span>
    </form>
  );
}
