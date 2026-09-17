"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SupportModeBannerProps {
  companyName: string;
  planTier: string;
}

export function SupportModeBanner({ companyName, planTier }: SupportModeBannerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleExit() {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        router.push(data.redirect || "/super-admin");
        router.refresh();
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-amber-300 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 px-3.5 py-2 sm:px-4 text-white shadow-md">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-black">
          ⚡
        </span>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs min-w-0">
          <span className="font-extrabold uppercase tracking-wider text-amber-100 shrink-0">
            Support Mode:
          </span>
          <span className="font-bold text-white truncate max-w-[180px] sm:max-w-none">
            Managing <span className="underline decoration-white/40 underline-offset-2">{companyName}</span>
          </span>
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200 shrink-0">
            {planTier === "CORE_LEAD_SUITE" ? "Core Suite" : "Premium ERP"}
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleExit}
        className="self-end sm:self-auto shrink-0 flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1 text-xs font-bold text-white transition hover:bg-black/60 disabled:opacity-50 cursor-pointer"
      >
        <span>{loading ? "Exiting..." : "Exit Support Mode →"}</span>
      </button>
    </div>
  );
}
