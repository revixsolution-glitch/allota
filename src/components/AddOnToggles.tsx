"use client";

import { useState, useTransition } from "react";
import { updateCompanyAddOns } from "@/lib/super-admin-actions";

export function AddOnToggles({
  companyId,
  initialAdsInsights,
  initialSocialInbox,
}: {
  companyId: string;
  initialAdsInsights: boolean;
  initialSocialInbox: boolean;
}) {
  const [adsInsights, setAdsInsights] = useState(initialAdsInsights);
  const [socialInbox, setSocialInbox] = useState(initialSocialInbox);
  const [isPending, startTransition] = useTransition();

  function toggle(key: "enableAdsInsights" | "enableSocialInbox", value: boolean) {
    if (key === "enableAdsInsights") setAdsInsights(value);
    else setSocialInbox(value);
    startTransition(async () => {
      await updateCompanyAddOns(companyId, { [key]: value });
    });
  }

  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold">
      <label
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 transition ${
          adsInsights ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-white text-ink-faint"
        } ${isPending ? "opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          checked={adsInsights}
          disabled={isPending}
          onChange={(e) => toggle("enableAdsInsights", e.target.checked)}
          className="h-3 w-3 accent-emerald-600"
        />
        📊 Ads Insights
      </label>
      <label
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 transition ${
          socialInbox ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-white text-ink-faint"
        } ${isPending ? "opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          checked={socialInbox}
          disabled={isPending}
          onChange={(e) => toggle("enableSocialInbox", e.target.checked)}
          className="h-3 w-3 accent-emerald-600"
        />
        💬 Social Inbox
      </label>
      {isPending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
    </div>
  );
}
