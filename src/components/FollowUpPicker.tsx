"use client";

import { useState } from "react";
import { setLeadFollowUp } from "@/lib/admin-actions";

function formatFollowUp(iso: string | null): { label: string; tone: "overdue" | "today" | "upcoming" | "none" } {
  if (!iso) return { label: "Not scheduled", tone: "none" };

  const target = new Date(iso);
  const now = new Date();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);

  const dateLabel = target.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  if (diffDays < 0) return { label: `Overdue • ${dateLabel}`, tone: "overdue" };
  if (diffDays === 0) return { label: `Today • ${dateLabel}`, tone: "today" };
  return { label: dateLabel, tone: "upcoming" };
}

export function FollowUpPicker({
  leadId,
  followUpAt,
  size = "md",
}: {
  leadId: string;
  followUpAt: string | null;
  size?: "md" | "sm";
}) {
  const [showCustom, setShowCustom] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const { label, tone } = formatFollowUp(followUpAt);

  const toneClass =
    tone === "overdue"
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : tone === "today"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : tone === "upcoming"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-ink-faint bg-slate-50 border-line";

  const h = size === "sm" ? "h-8" : "h-9";

  return (
    <div className="space-y-1.5">
      <span className={`inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>
        {label}
      </span>

      <form
        action={setLeadFollowUp}
        className="flex items-center gap-1.5"
        onSubmit={() => setShowCustom(false)}
      >
        <input type="hidden" name="leadId" value={leadId} />

        {showCustom ? (
          <>
            <input
              type="date"
              name="customDate"
              defaultValue={today}
              min={today}
              autoFocus
              className={`${h} flex-1 rounded-lg border border-line bg-white px-2 text-[11px] font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-primary`}
            />
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              title="Cancel custom date"
              className={`${h} shrink-0 rounded-lg border border-line bg-white px-2 text-[11px] text-ink-faint hover:text-ink transition cursor-pointer`}
            >
              ✕
            </button>
            <button
              type="submit"
              className={`${h} shrink-0 rounded-lg bg-primary px-2.5 text-[11px] font-bold text-white hover:bg-primary-strong transition cursor-pointer`}
            >
              Set
            </button>
          </>
        ) : (
          <select
            name="days"
            defaultValue="1"
            onChange={(e) => {
              if (e.target.value === "custom") {
                setShowCustom(true);
              } else {
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className={`${h} flex-1 rounded-lg border border-line bg-white px-2 text-[11px] font-semibold text-ink neo-pressed focus:outline-none focus:ring-1 focus:ring-primary`}
          >
            <option value="1">Tomorrow (1 day)</option>
            <option value="2">In 2 days</option>
            <option value="3">In 3 days</option>
            <option value="4">In 4 days</option>
            <option value="5">In 5 days</option>
            <option value="custom">Custom date…</option>
          </select>
        )}
      </form>
    </div>
  );
}
