"use client";

import { useState } from "react";
import Link from "next/link";
import { addLeadRemark } from "@/lib/admin-actions";

export interface RemarkItem {
  id: string;
  remark: string;
  createdAt: string;
  employeeName: string;
}

export function LeadRemarksModal({
  leadId,
  leadName,
  leadPhone,
  leadStatus,
  followUpAt,
  assignedRepName,
  assignedRepPhone,
  remarks: initialRemarks,
}: {
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadStatus: string;
  followUpAt?: string | null;
  assignedRepName?: string | null;
  assignedRepPhone?: string | null;
  remarks: RemarkItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [remarks, setRemarks] = useState<RemarkItem[]>(initialRemarks);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newRemarkText, setNewRemarkText] = useState("");

  const isDead = leadStatus === "NOT_INTERESTED";

  async function handleAddRemark(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newRemarkText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("leadId", leadId);
      formData.set("remark", newRemarkText.trim());

      await addLeadRemark(formData);

      // Optimistically add the new remark to local state
      const optimisticRemark: RemarkItem = {
        id: `temp-${Date.now()}`,
        remark: newRemarkText.trim(),
        createdAt: new Date().toISOString(),
        employeeName: "Admin",
      };

      setRemarks((prev) => [optimisticRemark, ...prev]);
      setNewRemarkText("");
    } catch (err: any) {
      alert(err?.message || "Failed to add remark");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Table Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 hover:border-amber-300 shadow-2xs cursor-pointer select-none"
        title={remarks.length > 0 ? remarks[0]?.remark : "Click to view representative remarks"}
      >
        <span>📝 Remarks</span>
        <span className="text-[10px] text-amber-700 font-extrabold">({remarks.length})</span>
      </button>

      {/* Pop-up Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-line flex flex-col justify-between z-10 animate-in zoom-in-95 duration-150">
            <div>
              {/* Header Bar */}
              <div className="flex items-start justify-between border-b border-line pb-3.5 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 font-extrabold text-base shrink-0">
                    📝
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-ink text-sm sm:text-base truncate">
                      Representative Remarks
                    </h3>
                    <p className="text-xs text-ink-faint truncate font-medium">
                      {leadName} · <span className="font-mono">{leadPhone}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-ink-faint hover:text-ink hover:bg-slate-200 transition cursor-pointer shrink-0 ml-2"
                  aria-label="Close popup"
                >
                  ✕
                </button>
              </div>

              {/* Exact Connection Strip: Rep, Status Marked, Follow-Up */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-50 border border-line-soft mb-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    Assigned Rep
                  </p>
                  <p className="font-extrabold text-ink mt-0.5 truncate">
                    {assignedRepName || "Unassigned"}
                  </p>
                  {assignedRepPhone && (
                    <p className="text-[10px] text-ink-faint font-mono">{assignedRepPhone}</p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    Rep Marked Status
                  </p>
                  <div className="mt-0.5">
                    {isDead ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-extrabold text-rose-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                        Dead Lead
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        Active ({leadStatus})
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    Follow-Up
                  </p>
                  <p className="font-semibold text-ink mt-0.5 text-[11px]">
                    {followUpAt
                      ? new Date(followUpAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "No follow-up set"}
                  </p>
                </div>
              </div>

              {/* Exact Written Remarks History */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-faint">
                    Written Remarks History ({remarks.length})
                  </h4>
                </div>

                {remarks.length === 0 ? (
                  <div className="rounded-2xl border border-line bg-slate-50/60 p-6 text-center">
                    <span className="text-2xl block mb-1">📝</span>
                    <p className="text-xs font-bold text-ink">
                      No remarks recorded by {assignedRepName || "representative"} yet.
                    </p>
                    <p className="text-[11px] text-ink-faint mt-1 max-w-xs mx-auto">
                      The representative has not entered any written notes. Current lead stage is{" "}
                      <strong>{isDead ? "Dead" : "Active"}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1">
                    {remarks.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl bg-amber-50/40 border border-amber-200/80 p-3.5 space-y-1.5"
                      >
                        <p className="text-xs text-ink leading-relaxed font-medium whitespace-pre-wrap">
                          {r.remark}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 text-[10px] text-ink-faint">
                          <span className="font-bold text-amber-900">
                            👤 {r.employeeName}
                          </span>
                          <span>
                            {new Date(r.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Remark Form (Admin can add notes or reply) */}
              <form onSubmit={handleAddRemark} className="space-y-2 pt-3 border-t border-line">
                <label className="block text-[11px] font-bold text-ink">
                  Add Note / Remark for Representative:
                </label>
                <textarea
                  value={newRemarkText}
                  onChange={(e) => setNewRemarkText(e.target.value)}
                  rows={2}
                  placeholder="Type an admin note, follow-up instruction, or observation..."
                  className="w-full rounded-2xl border border-line bg-slate-50 p-2.5 text-xs text-ink placeholder:text-ink-faint focus:bg-white focus:outline-teal-600"
                />
                <button
                  type="submit"
                  disabled={!newRemarkText.trim() || isSubmitting}
                  className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-amber-600 hover:bg-amber-700 py-2 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <span>{isSubmitting ? "Saving..." : "Add Remark"}</span>
                </button>
              </form>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-line mt-4">
              <Link
                href={`/admin/lead-history/${leadId}`}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1"
              >
                <span>Full Audit Timeline</span>
                <span>&rarr;</span>
              </Link>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-line px-4 py-1.5 text-xs font-bold text-ink-muted hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
