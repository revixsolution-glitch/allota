"use client";

import { updateLeadActiveStatus } from "@/lib/admin-actions";

interface LeadStatusToggleProps {
  leadId: string;
  status?: string;
  isDead?: boolean;
}

export function LeadStatusToggle({ leadId, status, isDead }: LeadStatusToggleProps) {
  const isConverted = status === "CONVERTED";
  const isDeadState = status === "NOT_INTERESTED" || (isDead === true && !isConverted);
  const isActive = !isConverted && !isDeadState;

  return (
    <form action={updateLeadActiveStatus} className="inline-flex items-center gap-1">
      <input type="hidden" name="leadId" value={leadId} />

      {/* 1. Active */}
      <label
        title="Active prospect in pipeline"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isActive
            ? "bg-emerald-500 border-emerald-500 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-emerald-300 hover:text-emerald-700"
        }`}
      >
        <input
          type="radio"
          name="status"
          value="ACTIVE"
          defaultChecked={isActive}
          className="sr-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-white" : "bg-emerald-500"}`} />
        Active
      </label>

      {/* 2. Converted (Graduates to My Clients tab) */}
      <label
        title="Mark converted — graduates to My Clients tab"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isConverted
            ? "bg-purple-600 border-purple-600 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-purple-300 hover:text-purple-700"
        }`}
      >
        <input
          type="radio"
          name="status"
          value="CONVERTED"
          defaultChecked={isConverted}
          className="sr-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${isConverted ? "bg-white" : "bg-purple-600"}`} />
        Converted
      </label>

      {/* 3. Dead */}
      <label
        title="Mark unviable or dead prospect"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isDeadState
            ? "bg-rose-500 border-rose-500 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-rose-300 hover:text-rose-700"
        }`}
      >
        <input
          type="radio"
          name="status"
          value="DEAD"
          defaultChecked={isDeadState}
          className="sr-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${isDeadState ? "bg-white" : "bg-rose-500"}`} />
        Dead
      </label>
    </form>
  );
}
