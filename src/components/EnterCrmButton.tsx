"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EnterCrmButton({
  companyId,
  companyName,
  className = "",
}: {
  companyId: string;
  companyName: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleEnter() {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(data.redirect || "/admin");
        router.refresh();
      } else {
        alert("Failed to enter company workspace.");
        setLoading(false);
      }
    } catch {
      alert("Network error entering workspace.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleEnter}
      className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:from-teal-500 hover:to-primary-strong disabled:opacity-50 ${className}`}
      title={`Enter ${companyName} CRM as Administrator`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>{loading ? "Entering..." : "⚡ Enter CRM as Admin"}</span>
    </button>
  );
}
