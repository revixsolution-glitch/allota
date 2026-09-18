"use client";

import { useState } from "react";
import { markWhatsAppAlertSent } from "@/lib/admin-actions";
import { craftAiWhatsAppMissedMessage } from "@/lib/call-helpers";

export function MissedCallAlertButton({
  callId,
  leadName,
  repName,
  companyName,
  division,
  territory,
  phoneNumber,
  alreadySent = false,
}: {
  callId: string;
  leadName?: string | null;
  repName?: string | null;
  companyName?: string | null;
  division?: string | null;
  territory?: string | null;
  phoneNumber?: string | null;
  alreadySent?: boolean;
}) {
  const [sent, setSent] = useState(alreadySent);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const raw = phoneNumber || "";
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      alert("No phone number available for this contact.");
      return;
    }
    const formatted = clean.startsWith("91") ? clean : `91${clean}`;
    const text = craftAiWhatsAppMissedMessage({
      leadName,
      repName,
      companyName,
      division,
      territory,
    });

    setLoading(true);
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(text)}`, "_blank");

    try {
      const fd = new FormData();
      fd.append("callId", callId);
      await markWhatsAppAlertSent(fd);
      setSent(true);
    } catch (e) {
      console.error("Failed to mark WhatsApp alert sent", e);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 border border-emerald-300">
        ✓ WhatsApp Sent
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
      title="Open WhatsApp with AI follow-up message"
    >
      <span>{loading ? "⏳" : "⚡"}</span>
      <span>Send AI WhatsApp Alert</span>
    </button>
  );
}
