"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface EmployeeOption {
  id: string;
  name: string;
}

export function FollowUpEmployeeFilter({
  employees,
  currentEmployeeId = "",
}: {
  employees: EmployeeOption[];
  currentEmployeeId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(employeeId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page"); // Reset to page 1 on filter switch
    if (!employeeId || employeeId === "all") {
      sp.delete("employeeId");
    } else {
      sp.set("employeeId", employeeId);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentEmployeeId || ""}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Filter by representative"
        className="h-9 rounded-xl border border-line bg-white pl-3 pr-8 text-xs font-semibold text-ink neo-pressed focus:border-primary focus:outline-none cursor-pointer appearance-none transition shadow-2xs"
      >
        <option value="">All Representatives ({employees.length})</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            👤 {emp.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-xs text-ink-muted">
        ▾
      </span>
    </div>
  );
}

export { FollowUpEmployeeFilter as EmployeeFilter };
