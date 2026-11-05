"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateLeadActiveStatus } from "@/lib/admin-actions";

interface LeadStatusToggleProps {
  leadId: string;
  status?: string;
  isDead?: boolean;
  deadReason?: string | null;
  layout?: "vertical" | "horizontal";
}

export function LeadStatusToggle({
  leadId,
  status,
  isDead,
  deadReason,
  layout = "vertical",
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
  // Fresh leads (NEW or ASSIGNED) should NEVER be active by default.
  // Only leads explicitly clicked/marked as Active (CONTACTED / INTERESTED / ACTIVE) are active.
  const isActive = currentStatus === "CONTACTED" || currentStatus === "INTERESTED" || currentStatus === "ACTIVE";
  const isIrrelevant = isDeadState && currentDeadReason === "IRRELEVANT";

  const handleStatusChange = (newStat: "ACTIVE" | "CONVERTED") => {
    setIsOpen(false);
    // If clicking an already-selected status, toggle off back to unselected
    if ((newStat === "ACTIVE" && isActive) || (newStat === "CONVERTED" && isConverted)) {
      setCurrentStatus("ASSIGNED");
      setCurrentDeadReason(null);

      startTransition(async () => {
        const fd = new FormData();
        fd.set("leadId", leadId);
        fd.set("status", "UNSET");
        await updateLeadActiveStatus(fd);
      });
      return;
    }

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
    // If clicking the same dead reason, toggle back to unselected
    if (isDeadState && ((reason === "IRRELEVANT" && isIrrelevant) || (reason === "DEAD" && !isIrrelevant))) {
      setCurrentStatus("ASSIGNED");
      setCurrentDeadReason(null);

      startTransition(async () => {
        const fd = new FormData();
        fd.set("leadId", leadId);
        fd.set("status", "UNSET");
        await updateLeadActiveStatus(fd);
      });
      return;
    }

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

  const isVertical = layout === "vertical";

  return (
    <div
      ref={menuRef}
      className={`relative inline-flex ${
        isVertical ? "flex-col items-stretch gap-1 w-[84px]" : "items-center gap-1"
      } ${isPending ? "opacity-75" : ""}`}
    >
      {/* 1. Active */}
      <button
        type="button"
        onClick={() => handleStatusChange("ACTIVE")}
        title="Active prospect in pipeline"
        className={`${
          isVertical ? "w-full justify-start" : ""
        } inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isActive
            ? "bg-emerald-500 border-emerald-500 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-emerald-300 hover:text-emerald-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            isActive ? "bg-white" : "bg-emerald-500"
          }`}
        />
        <span>Active</span>
      </button>

      {/* 2. Converted */}
      <button
        type="button"
        onClick={() => handleStatusChange("CONVERTED")}
        title="Mark converted — graduates to My Clients tab"
        className={`${
          isVertical ? "w-full justify-start" : ""
        } inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
          isConverted
            ? "bg-purple-600 border-purple-600 text-white shadow-2xs"
            : "bg-white border-line text-ink-faint hover:border-purple-300 hover:text-purple-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            isConverted ? "bg-white" : "bg-purple-600"
          }`}
        />
        <span>Converted</span>
      </button>

      {/* 3. Dead / Irrelevant Dropdown Trigger */}
      <div className={`relative ${isVertical ? "w-full" : "inline-block"}`}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Mark dead or irrelevant inquiry"
          className={`${
            isVertical ? "w-full justify-between" : ""
          } inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer transition select-none ${
            isDeadState
              ? isIrrelevant
                ? "bg-amber-600 border-amber-600 text-white shadow-2xs"
                : "bg-rose-500 border-rose-500 text-white shadow-2xs"
              : "bg-white border-line text-ink-faint hover:border-rose-300 hover:text-rose-700"
          }`}
        >
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                isDeadState ? "bg-white" : "bg-rose-500"
              }`}
            />
            <span className="truncate">
              {isDeadState
                ? isIrrelevant
                  ? "Irrelevant"
                  : "Dead"
                : "Dead"}
            </span>
          </div>
          <svg
            className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150 ${
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

        {/* Dropdown Menu (Pops up above button) */}
        {isOpen && (
          <div className="absolute right-0 bottom-full mb-1.5 w-36 rounded-xl bg-white p-1 shadow-xl border border-line z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5">
            {/* Option A: Dead */}
            <button
              type="button"
              onClick={() => handleDeadSelection("DEAD")}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                isDeadState && !isIrrelevant
                  ? "bg-rose-50 text-rose-700 font-bold"
                  : "hover:bg-slate-50 text-ink"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">🔴</span>
                <span>Dead</span>
              </div>
              {isDeadState && !isIrrelevant && (
                <span className="text-[10px] text-rose-600 font-bold">✓</span>
              )}
            </button>

            {/* Option B: Irrelevant */}
            <button
              type="button"
              onClick={() => handleDeadSelection("IRRELEVANT")}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                isIrrelevant
                  ? "bg-amber-50 text-amber-700 font-bold"
                  : "hover:bg-slate-50 text-ink"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">🚫</span>
                <span>Irrelevant</span>
              </div>
              {isIrrelevant && (
                <span className="text-[10px] text-amber-600 font-bold">✓</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
