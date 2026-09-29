"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdsInsightsRefreshButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ads-insights/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't refresh right now.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {lastSyncedAt && (
          <span className="text-xs text-ink-faint">
            Updated {new Date(lastSyncedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "🔄 Refresh"}
        </button>
      </div>
      {error && <span className="max-w-xs text-right text-xs font-semibold text-rose-600">{error}</span>}
    </div>
  );
}
