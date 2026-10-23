"use client";

import { useState } from "react";
import { createCompanyEmployee } from "@/lib/admin-actions";
import { SELECTABLE_SOURCES } from "@/lib/lead-sources";
import { SourceIcon } from "@/components/SourceIcon";

export function AddEmployeeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{
    name: string;
    email: string;
    pass: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const pass = String(formData.get("password") || "employee123");

    try {
      const res = await createCompanyEmployee(formData);
      setLoading(false);

      if (res?.error) {
        setError(res.error);
        return;
      }

      if (res?.success) {
        setCreatedInfo({ name, email, pass });
      }
    } catch {
      setLoading(false);
      setError("Failed to create representative.");
    }
  }

  function handleClose() {
    setIsOpen(false);
    setCreatedInfo(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 hover:from-purple-500 hover:to-indigo-500 transition"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        <span>+ Add Representative</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl neo-panel border border-line bg-white p-6 shadow-2xl">
            {createdInfo ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 font-bold">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">Representative Created!</h3>
                    <p className="text-xs text-ink-muted">Account is ready for field app login</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-slate-50 p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Name:</span>
                    <span className="font-bold text-ink">{createdInfo.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Login Email:</span>
                    <span className="font-mono font-bold text-primary">{createdInfo.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Password:</span>
                    <span className="font-mono font-bold text-ink">{createdInfo.pass}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <h3 className="text-base font-bold text-ink">Create Representative Login</h3>
                    <p className="text-xs text-ink-muted">Provision a new field sales executive account</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-ink-faint hover:text-ink text-sm"
                  >
                    ✕
                  </button>
                </div>

                {error && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Vikram Malhotra"
                    className="w-full rounded-xl border border-line bg-slate-50/50 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-ink-muted">Login ID (User ID or Email)</label>
                    <span className="text-[10px] text-teal-600 font-semibold">No email required</span>
                  </div>
                  <input
                    type="text"
                    name="email"
                    required
                    placeholder="e.g. savi01, vikram, or rahul@kesrox.com"
                    className="w-full rounded-xl border border-line bg-slate-50/50 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
                  />
                  <p className="text-[10px] text-ink-faint mt-1">
                    Enter any simple User ID (like <strong>savi01</strong>) or email. Representative can log in with this ID or their phone number.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1">Phone Number</label>
                  <input
                    type="text"
                    name="phoneNumber"
                    required
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-line bg-slate-50/50 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1">Initial Password</label>
                  <input
                    type="password"
                    name="password"
                    required
                    defaultValue="employee123"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-line bg-slate-50/50 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1.5">
                    Auto-Assign to Sources (optional)
                  </label>
                  <p className="text-[11px] text-ink-faint mb-2">
                    New leads from these sources will round-robin to this rep. You can change this anytime.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SELECTABLE_SOURCES.map((s) => (
                      <label
                        key={s.value}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-slate-50/50 px-2.5 py-1.5 text-[11px] font-semibold text-ink cursor-pointer hover:bg-slate-100 transition"
                      >
                        <input type="checkbox" name="sources" value={s.value} className="accent-primary" />
                        <SourceIcon source={s.value} className="h-3.5 w-3.5 shrink-0" />
                        <span>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-xl border border-line px-3.5 py-2 text-xs font-bold text-ink-muted hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-strong transition disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create Account →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
