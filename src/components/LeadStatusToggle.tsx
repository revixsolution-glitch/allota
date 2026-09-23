"use client";

import { updateLeadActiveStatus } from "@/lib/admin-actions";

export function LeadStatusToggle({ leadId, isDead }: { leadId: string; isDead: boolean }) {
  return (
    <form action={updateLeadActiveStatus} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="leadId" value={leadId} />

      <label
        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold cursor-pointer transition ${
          !isDead
            ? "bg-emerald-500 border-emerald-500 text-white shadow-xs"
            : "bg-white border-line text-ink-faint hover:border-emerald-300 hover:text-emerald-700"
        }`}
      >
        <input
          type="radio"
          name="isDead"
          value="false"
          defaultChecked={!isDead}
          className="sr-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${!isDead ? "bg-white" : "bg-emerald-500"}`} />
        Active
      </label>

      <label
        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold cursor-pointer transition ${
          isDead
            ? "bg-rose-500 border-rose-500 text-white shadow-xs"
            : "bg-white border-line text-ink-faint hover:border-rose-300 hover:text-rose-700"
        }`}
      >
        <input
          type="radio"
          name="isDead"
          value="true"
          defaultChecked={isDead}
          className="sr-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${isDead ? "bg-white" : "bg-rose-500"}`} />
        Dead
      </label>
    </form>
  );
}
