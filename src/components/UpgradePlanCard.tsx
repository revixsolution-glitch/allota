"use client";

import { useState } from "react";

interface UpgradePlanCardProps {
  type: "ERP" | "SOCIAL";
  companyName?: string;
}

export function UpgradePlanCard({ type, companyName = "Your Company" }: UpgradePlanCardProps) {
  const [showModal, setShowModal] = useState(false);

  const isErp = type === "ERP";

  const title = isErp
    ? "Full Commercial ERP Suite"
    : "Social Media Lead Automation Suite";

  const buttonText = isErp ? "Upgrade Plan" : "Add Social Media Feature";

  const badge = isErp ? "Enterprise Integration" : "Growth Expansion";

  const description = isErp
    ? "Connect your live Marg ERP 9+ or Busy accounting server. Sync real-time inventory batch numbers, distributor ledgers, GST invoices, and automated reorder replenishment."
    : "Capture leads automatically from Facebook & Instagram ad comments, organic posts, and direct messages (DMs). Instantly route prospects to your sales representatives.";

  const features = isErp
    ? [
        "Marg ERP 9+ & Busy 15-minute background invoice sync",
        "Stock IQ: Real-time box count & 90-day expiry watch",
        "Smart Reorders: Automated distributor replenishment cadence",
        "Credit Ledger: Outstanding recovery & AI payment reminder calls",
        "Franchise Clients Master & territory monopoly boundaries",
      ]
    : [
        "Facebook & Instagram Lead Ads real-time webhook sync",
        "Instagram Direct Message (DM) inquiry capture",
        "Ad Comment & Post Engagement to lead auto-converter",
        "WhatsApp Business Cloud API broadcast triggers",
        "Multi-channel marketing attribution analytics",
      ];

  const emailSubject = encodeURIComponent(
    `Upgrade Request: ${title} for ${companyName}`
  );
  const emailBody = encodeURIComponent(
    `Hello Allota Support Team,\n\nWe would like to activate the ${title} for our organization (${companyName}).\n\nPlease advise on API configuration, credentials, and activation steps.\n\nThank you.`
  );

  return (
    <>
      <div
        className={`rounded-2xl p-6 border transition relative flex flex-col justify-between ${
          isErp
            ? "border-purple-200 bg-purple-50/20 hover:border-purple-300 hover:shadow-md"
            : "border-blue-200 bg-blue-50/20 hover:border-blue-300 hover:shadow-md"
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                isErp
                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                  : "bg-blue-100 text-blue-800 border border-blue-200"
              }`}
            >
              {badge}
            </span>
            <span className="text-xs font-semibold text-ink-faint">Available Add-On</span>
          </div>

          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-2xl">{isErp ? "🏢" : "📱"}</span>
            <h3 className="text-base font-extrabold text-ink">{title}</h3>
          </div>

          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            {description}
          </p>

          <div className="mt-4 space-y-1.5 border-t border-line/60 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              What's Included:
            </p>
            {features.map((f) => (
              <div key={f} className="flex items-start gap-2 text-xs text-ink">
                <span className={isErp ? "text-purple-600 font-bold" : "text-blue-600 font-bold"}>
                  ✓
                </span>
                <span className="text-[11px] text-ink-muted">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-line/60 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-ink-faint">Licensing Status</p>
            <p className="text-xs font-bold text-ink">Ready to Activate</p>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold text-white shadow-sm transition ${
              isErp
                ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20"
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
            }`}
          >
            <span>⚡</span>
            <span>{buttonText}</span>
          </button>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl border border-line space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${
                    isErp ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {isErp ? "🏢" : "📱"}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-ink">{title}</h3>
                  <p className="text-xs text-ink-faint">Upgrade Request for {companyName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink transition"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-line text-xs text-ink-muted leading-relaxed space-y-2">
              <p className="font-bold text-ink flex items-center gap-1.5">
                <span>ℹ️</span> How activation works:
              </p>
              {isErp ? (
                <p>
                  The Full Commercial ERP Suite connects directly with your office Marg ERP 9+ or Busy Accounting server via API connector or relay agent. Once connected, your distributors, pending balances, stock box quantities, and invoices sync automatically every 15 minutes.
                </p>
              ) : (
                <p>
                  The Social Media Suite connects your official Meta Business Account, Instagram handle, and WhatsApp Cloud API. Leads captured from Instagram ads, organic DMs, and post comments are instantly ingested into your Lead Center.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-ink">Choose activation method:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={`mailto:support@allota.ai?subject=${emailSubject}&body=${emailBody}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-emerald-700 transition"
                >
                  <span>✉️</span>
                  <span>Contact Sales / Support</span>
                </a>
                <a
                  href="tel:+917696552865"
                  className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-slate-50 transition"
                >
                  <span>📞</span>
                  <span>Call Account Rep</span>
                </a>
              </div>
            </div>

            <div className="pt-3 border-t border-line/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
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
