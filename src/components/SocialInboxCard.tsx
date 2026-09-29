"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InboxItem {
  id: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  kind: "COMMENT" | "MESSAGE";
  fromName: string | null;
  fromId: string | null;
  text: string | null;
  status: "NEW" | "REPLIED" | "IGNORED";
  aiDraftReply: string | null;
  repliedText: string | null;
  receivedAt: string;
}

export function SocialInboxCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [draft, setDraft] = useState(item.aiDraftReply || "");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch(`/api/social-inbox/${item.id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Couldn't draft a reply.");
      else setDraft(data.draft);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!draft.trim()) {
      setError("Write or generate a reply first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/social-inbox/${item.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Meta declined this reply.");
      else router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSending(false);
    }
  }

  const platformBadge =
    item.platform === "INSTAGRAM"
      ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white"
      : "bg-blue-600 text-white";

  return (
    <div className="rounded-2xl neo-panel bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${platformBadge}`}>
            {item.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
          </span>
          <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-ink-muted">
            {item.kind === "COMMENT" ? "💬 Comment" : "✉️ Message"}
          </span>
          {item.status === "REPLIED" && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
              ✓ Replied
            </span>
          )}
        </div>
        <span className="text-xs text-ink-faint">
          {new Date(item.receivedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <p className="mt-3 text-sm font-bold text-ink">{item.fromName || "Someone"}</p>
      <p className="mt-0.5 text-sm text-ink-muted leading-relaxed">{item.text || "(no text)"}</p>

      {item.status === "REPLIED" ? (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Your reply</p>
          <p className="mt-1 text-sm text-ink">{item.repliedText}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write a reply, or let AI draft one…"
            className="w-full rounded-xl border border-line bg-white p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDraft}
              disabled={drafting}
              className="rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs font-bold text-ink transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
            >
              {drafting ? "Thinking…" : "✨ AI Draft Reply"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send Reply →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
