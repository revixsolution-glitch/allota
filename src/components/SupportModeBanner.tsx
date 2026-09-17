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
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-amber-300 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 px-4 py-2 text-white shadow-md">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-black">
          ⚡
        </span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold uppercase tracking-wider text-amber-100">
            Super Admin Support Mode:
          </span>
          <span className="font-bold text-white">
            Managing <span className="underline decoration-white/40 underline-offset-2">{companyName}</span>
          </span>
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
            {planTier === "CORE_LEAD_SUITE" ? "Core Lead Suite" : "Premium ERP Plan"}
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handleExit}
        className="flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1 text-xs font-bold text-white transition hover:bg-black/60 disabled:opacity-50"
      >
        <span>{loading ? "Exiting..." : "Exit Support Mode →"}</span>
      </button>
    </div>
  );
}
