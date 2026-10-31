"use client";

import { useState } from "react";

export function ChangePasswordSection({ userEmail }: { userEmail?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (newPassword.length < 6) {
      setStatus({ type: "error", message: "New password must be at least 6 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to update password." });
      } else {
        setStatus({ type: "success", message: data.message || "Password updated successfully!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl p-6 neo-panel bg-white border border-line space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
            <span>🔐</span> Account &amp; Password Security
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Logged in as <strong className="text-ink">{userEmail || "Administrator"}</strong>. Update your login credentials below.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 text-ink-muted px-2.5 py-0.5 text-[10px] font-bold">
          Self-Service
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        {status && (
          <div
            className={`rounded-2xl p-3 text-xs font-semibold ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {status.message}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-ink mb-1">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            required
            className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? "Updating..." : "Update Password"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
