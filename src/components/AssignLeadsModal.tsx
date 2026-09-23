"use client";

import { useEffect, useState } from "react";

/**
 * "Assign Leads" button that opens the Quick Leads Allotment Desk (passed as
 * children) in a popup. Children stay mounted while closed so a submitting
 * server-action form is never torn down mid-request.
 */
export function AssignLeadsModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition cursor-pointer"
      >
        <span>⚡</span>
        Assign Leads
      </button>

      <div
        className={`fixed inset-0 z-50 items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center ${
          open ? "flex" : "hidden"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Leads Allotment Desk"
        onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        onSubmit={() => setTimeout(() => setOpen(false), 300)}
      >
        <div className="relative w-full max-w-6xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-muted shadow-md hover:text-ink cursor-pointer"
          >
            ✕
          </button>
          {children}
        </div>
      </div>
    </>
  );
}
