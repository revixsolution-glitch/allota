"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateLeadActiveStatus } from "@/lib/admin-actions";

interface LeadStatusToggleProps {
  leadId: string;
  status?: string;
  isDead?: boolean;
  deadReason?: string | null;
}

export function LeadStatusToggle({
  leadId,
  status,
  isDead,
  deadReason,
}: LeadStatusToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Derive initial values
  const isInitiallyConverted = status === "CONVERTED";
  const isInitiallyDead = status === "NOT_INTERESTED" || (isDead === true && !isInitiallyConverted);

  const [currentStatus, setCurrentStatus] = useState<string>(
    status || (isDead ? "NOT_INTERESTED" : "NEW")
  );
  const [currentDeadReason, setCurrentDeadReason] = useState<string | null | undefined>(
    deadReason || (isInitiallyDead ? "DEAD" : null)
  );

  useEffect(() => {
    setCurrentStatus(status || (isDead ? "NOT_INTERESTED" : "NEW"));
    setCurrentDeadReason(deadReason || (isDead ? "DEAD" : null));
  }, [status, isDead, deadReason]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const isConverted = currentStatus === "CONVERTED";
  const isDeadState = currentStatus === "NOT_INTERESTED" || (isDead === true && !isConverted);
  const isActive = !isConverted && !isDeadState;
  const isIrrelevant = isDeadState && currentDeadReason === "IRRELEVANT";

  const handleStatusChange = (newStat: "ACTIVE" | "CONVERTED") => {
    setIsOpen(false);
    setCurrentStatus(newStat === "ACTIVE" ? "CONTACTED" : "CONVERTED");
    setCurrentDeadReason(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("status", newStat);
      await updateLeadActiveStatus(fd);
    });
  };

  const handleDeadSelection = (reason: "DEAD" | "IRRELEVANT") => {
    setIsOpen(false);
    setCurrentStatus("NOT_INTERESTED");
    setCurrentDeadReason(reason);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("status", reason);
      fd.set("deadReason", reason);
      await updateLeadActiveStatus(fd);
    });
  };

  return (
    <div
      ref={menuRef}
      className={`relative inline-flex items-center gap-1 ${
        isPending ? "opacity-75" : ""
      }`}
    >
      {/* 1. Active */}
      <button
        type="button"
        onClick={() => handleStatusChange("ACTIVE")}
        title="Active prospect in pipeline"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isActive
            ? "bg-emerald-500 border-emerald-500 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-emerald-300 hover:text-emerald-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-white" : "bg-emerald-500"
          }`}
        />
        Active
      </button>

      {/* 2. Converted */}
      <button
        type="button"
        onClick={() => handleStatusChange("CONVERTED")}
        title="Mark converted — graduates to My Clients tab"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isConverted
            ? "bg-purple-600 border-purple-600 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-purple-300 hover:text-purple-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isConverted ? "bg-white" : "bg-purple-600"
          }`}
        />
        Converted
      </button>

      {/* 3. Dead / Irrelevant Dropdown Trigger */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Mark dead or irrelevant inquiry"
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
            isDeadState
              ? isIrrelevant
                ? "bg-amber-600 border-amber-600 text-white shadow-2xs"
                : "bg-rose-500 border-rose-500 text-white shadow-2xs"
              : "bg-white border-line text-ink-faint hover:border-rose-300 hover:text-rose-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isDeadState ? "bg-white" : "bg-rose-500"
            }`}
          />
          <span>
            {isDeadState
              ? isIrrelevant
                ? "🚫 Irrelevant"
                : "🔴 Dead"
              : "Dead"}
          </span>
          <svg
            className={`h-2.5 w-2.5 transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            } ${isDeadState ? "text-white" : "text-ink-faint"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl bg-white p-1.5 shadow-xl border border-line z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint border-b border-line-soft mb-1">
              Select Closed Category
            </div>

            {/* Option A: Dead */}
            <button
              type="button"
              onClick={() => handleDeadSelection("DEAD")}
              className={`w-full rounded-xl p-2 text-left transition cursor-pointer flex items-start gap-2 ${
                isDeadState && !isIrrelevant
                  ? "bg-rose-50 text-rose-950 font-semibold"
                  : "hover:bg-slate-50 text-ink"
              }`}
            >
              <span className="text-sm leading-none mt-0.5">🔴</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-rose-700 flex items-center justify-between">
                  <span>Dead Lead</span>
                  {isDeadState && !isIrrelevant && (
                    <span className="text-[10px] text-rose-600 font-bold">Selected</span>
                  )}
                </div>
                <p className="text-[10px] text-ink-muted leading-tight mt-0.5">
                  Not interested, price mismatch, competitor chosen
                </p>
              </div>
            </button>

            {/* Option B: Irrelevant */}
            <button
              type="button"
              onClick={() => handleDeadSelection("IRRELEVANT")}
              className={`w-full rounded-xl p-2 text-left transition cursor-pointer flex items-start gap-2 mt-1 ${
                isIrrelevant
                  ? "bg-amber-50 text-amber-950 font-semibold"
                  : "hover:bg-slate-50 text-ink"
              }`}
            >
              <span className="text-sm leading-none mt-0.5">🚫</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-amber-700 flex items-center justify-between">
                  <span>Irrelevant Inquiry</span>
                  {isIrrelevant && (
                    <span className="text-[10px] text-amber-600 font-bold">Selected</span>
                  )}
                </div>
                <p className="text-[10px] text-ink-muted leading-tight mt-0.5">
                  Wrong number, student, job seeker, invalid inquiry
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
