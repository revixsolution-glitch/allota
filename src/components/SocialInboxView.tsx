"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

export interface SocialItemData {
  id: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  kind: "COMMENT" | "MESSAGE" | "LIKE";
  fromName: string | null;
  fromId: string | null;
  text: string | null;
  postOrThreadId: string | null;
  postTitle?: string | null;
  postThumbnail?: string | null;
  permalink?: string | null;
  status: "NEW" | "REPLIED" | "IGNORED" | "SEEN";
  aiDraftReply: string | null;
  repliedText: string | null;
  receivedAt: string;
}

export function SocialInboxView({
  initialItems,
  companyName = "My Company",
}: {
  initialItems: SocialItemData[];
  companyName?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SocialItemData[]>(initialItems);
  const [activeTab, setActiveTab] = useState<"ALL" | "COMMENT" | "LIKE" | "MESSAGE">("ALL");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "INSTAGRAM" | "FACEBOOK">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Per-card draft and sending state
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync / Refresh social activity
  async function handleSync() {
    setIsSyncing(true);
    setSyncStatus("Checking Meta feed & comments...");
    try {
      const res = await fetch("/api/social-inbox/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        setItems(
          data.items.map((i: any) => ({
            ...i,
            receivedAt: new Date(i.receivedAt).toISOString(),
          }))
        );
        setSyncStatus(`Updated! Synced ${data.syncedCount || 0} recent interactions.`);
      } else {
        setSyncStatus("Synced successfully.");
      }
      setTimeout(() => setSyncStatus(null), 4000);
      router.refresh();
    } catch {
      setSyncStatus("Sync failed. Check connection.");
      setTimeout(() => setSyncStatus(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  }

  // AI Draft Reply
  async function handleDraft(id: string) {
    setDraftingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/social-inbox/${id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: data.error || "Failed to generate draft." }));
      } else {
        setDrafts((prev) => ({ ...prev, [id]: data.draft }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Server connection failed." }));
    } finally {
      setDraftingId(null);
    }
  }

  // Send Reply
  async function handleSend(id: string) {
    const draftText = drafts[id] || "";
    if (!draftText.trim()) {
      setErrors((prev) => ({ ...prev, [id]: "Please write or generate a reply first." }));
      return;
    }

    setSendingId(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/social-inbox/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draftText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: data.error || "Meta declined reply." }));
      } else {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: "REPLIED", repliedText: draftText } : item
          )
        );
        router.refresh();
      }
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Network error while sending reply." }));
    } finally {
      setSendingId(null);
    }
  }

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeTab !== "ALL" && item.kind !== activeTab) return false;
      if (platformFilter !== "ALL" && item.platform !== platformFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.fromName?.toLowerCase().includes(q) || false;
        const matchesText = item.text?.toLowerCase().includes(q) || false;
        const matchesPost = item.postTitle?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesText && !matchesPost) return false;
      }

      return true;
    });
  }, [items, activeTab, platformFilter, searchQuery]);

  // Metrics
  const stats = useMemo(() => {
    const total = items.length;
    const comments = items.filter((i) => i.kind === "COMMENT").length;
    const likes = items.filter((i) => i.kind === "LIKE").length;
    const dms = items.filter((i) => i.kind === "MESSAGE").length;
    const newItems = items.filter((i) => i.status === "NEW").length;
    return { total, comments, likes, dms, newItems };
  }, [items]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Executive Header */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-white p-6 sm:p-7 neo-panel shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {companyName} · Live Social Desk
              </span>
              {syncStatus && (
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                  {syncStatus}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-ink mt-2 tracking-tight">
              Social Media Activity &amp; Community Inbox
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-2xl leading-relaxed">
              Real-time feed of comments, post likes, and direct messages (DMs) from Facebook &amp; Instagram. 
              See which post got loved or commented, and reply in 1-click.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer disabled:opacity-50"
            >
              <span className={isSyncing ? "animate-spin" : ""}>🔄</span>
              <span>{isSyncing ? "Syncing Feed..." : "Sync Social Feed"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setActiveTab("COMMENT")}
          className={`rounded-2xl bg-white p-4 sm:p-5 neo-panel border transition cursor-pointer ${
            activeTab === "COMMENT" ? "border-sky-500 ring-2 ring-sky-500/20" : "border-line"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800">Post Comments</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-50 text-sm">💬</span>
          </div>
          <p className="text-3xl font-black text-ink mt-2">{stats.comments}</p>
          <p className="text-[10px] text-ink-faint mt-1">Questions &amp; franchise inquiries</p>
        </div>

        <div
          onClick={() => setActiveTab("LIKE")}
          className={`rounded-2xl bg-white p-4 sm:p-5 neo-panel border transition cursor-pointer ${
            activeTab === "LIKE" ? "border-rose-500 ring-2 ring-rose-500/20" : "border-line"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">Likes &amp; Reactions</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-sm">❤️</span>
          </div>
          <p className="text-3xl font-black text-ink mt-2">{stats.likes}</p>
          <p className="text-[10px] text-ink-faint mt-1">Post appreciations &amp; brand love</p>
        </div>

        <div
          onClick={() => setActiveTab("MESSAGE")}
          className={`rounded-2xl bg-white p-4 sm:p-5 neo-panel border transition cursor-pointer ${
            activeTab === "MESSAGE" ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-line"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">Direct Messages (DMs)</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-sm">✉️</span>
          </div>
          <p className="text-3xl font-black text-ink mt-2">{stats.dms}</p>
          <p className="text-[10px] text-ink-faint mt-1">Private 1-on-1 conversations</p>
        </div>

        <div className="rounded-2xl bg-white p-4 sm:p-5 neo-panel border border-line">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">New / Unread</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-sm">⚡</span>
          </div>
          <p className="text-3xl font-black text-emerald-600 mt-2">{stats.newItems}</p>
          <p className="text-[10px] text-emerald-700/80 mt-1">Awaiting your review or response</p>
        </div>
      </div>

      {/* Filter Tabs & Platform Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
        {/* Interaction Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: `All Activity (${stats.total})` },
            { id: "COMMENT", label: `💬 Comments (${stats.comments})` },
            { id: "LIKE", label: `❤️ Likes (${stats.likes})` },
            { id: "MESSAGE", label: `✉️ DMs (${stats.dms})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-ink-muted border border-line hover:bg-slate-50 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Platform Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase text-ink-faint mr-1">Platform:</span>
          <button
            onClick={() => setPlatformFilter("ALL")}
            className={`rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
              platformFilter === "ALL"
                ? "bg-slate-200 text-slate-900 font-extrabold"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setPlatformFilter("INSTAGRAM")}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
              platformFilter === "INSTAGRAM"
                ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white shadow-xs"
                : "text-pink-600 hover:bg-pink-50"
            }`}
          >
            <span>📸</span>
            <span>Instagram</span>
          </button>
          <button
            onClick={() => setPlatformFilter("FACEBOOK")}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
              platformFilter === "FACEBOOK"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-blue-600 hover:bg-blue-50"
            }`}
          >
            <span>📘</span>
            <span>Facebook</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-faint text-sm">
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by prospect name, message keyword, or post topic..."
          className="w-full rounded-2xl border border-line bg-white pl-10 pr-4 py-2.5 text-xs text-ink placeholder:text-ink-faint focus:outline-teal-600 shadow-2xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-ink-faint hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-3xl border border-line bg-white p-12 text-center neo-panel space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            {activeTab === "LIKE" ? "❤️" : activeTab === "MESSAGE" ? "✉️" : "💬"}
          </div>
          <h3 className="text-base font-extrabold text-ink">
            No {activeTab === "ALL" ? "social interactions" : activeTab.toLowerCase() + "s"} found
          </h3>
          <p className="text-xs text-ink-muted max-w-md mx-auto">
            {searchQuery
              ? "No interactions matched your search query. Try clearing the filter."
              : "As users comment on your posts, send DMs, or like your media on Instagram & Facebook, they will immediately appear here."}
          </p>
          <button
            onClick={handleSync}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition cursor-pointer"
          >
            <span>🔄</span> Refresh Feed Now
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isInstagram = item.platform === "INSTAGRAM";
            const draftVal = drafts[item.id] !== undefined ? drafts[item.id] : item.aiDraftReply || "";
            const isDrafting = draftingId === item.id;
            const isSending = sendingId === item.id;
            const cardError = errors[item.id];

            return (
              <div
                key={item.id}
                className="rounded-3xl border border-line bg-white p-5 sm:p-6 neo-panel shadow-xs transition hover:shadow-md space-y-4"
              >
                {/* 1. WHICH POST GOT INTERACTION (POST CONTEXT BANNER) */}
                {item.postTitle && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-xs shadow-2xs">
                        {isInstagram ? "📸" : "📘"}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-faint block">
                          On Post / Reel
                        </span>
                        <p className="font-bold text-ink truncate text-xs">
                          {item.postTitle}
                        </p>
                      </div>
                    </div>

                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-1 text-[11px] font-bold text-ink-muted hover:text-ink hover:bg-slate-100 transition shrink-0"
                      >
                        <span>View Post</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>
                )}

                {/* 2. SENDER & INTERACTION HEADER */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* User Avatar Circle */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-black text-sm text-white shadow-xs ${
                        isInstagram
                          ? "bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600"
                          : "bg-blue-600"
                      }`}
                    >
                      {(item.fromName || "P")[0].toUpperCase()}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-sm text-ink">
                          {item.fromName || "Anonymous Prospect"}
                        </p>
                        {item.status === "NEW" && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="New activity" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-extrabold ${
                            isInstagram
                              ? "bg-pink-50 text-pink-700 border border-pink-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {isInstagram ? "Instagram" : "Facebook"}
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-extrabold ${
                            item.kind === "LIKE"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : item.kind === "MESSAGE"
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {item.kind === "LIKE"
                            ? "❤️ Post Like"
                            : item.kind === "MESSAGE"
                            ? "✉️ Direct Message (DM)"
                            : "💬 Comment"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs text-ink-faint">
                    {new Date(item.receivedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* 3. INTERACTION CONTENT */}
                <div className="rounded-2xl bg-slate-50/70 border border-line/70 p-4">
                  {item.kind === "LIKE" ? (
                    <div className="flex items-center gap-2 text-rose-600 font-bold text-xs sm:text-sm">
                      <span className="text-lg">❤️</span>
                      <span>Liked and appreciated this post!</span>
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
                      &ldquo;{item.text || "(No message body)"}&rdquo;
                    </p>
                  )}
                </div>

                {/* 4. ACTIONS & REPLY THREAD (FOR COMMENTS & DMs) */}
                {item.kind !== "LIKE" && (
                  <div>
                    {item.status === "REPLIED" ? (
                      <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3.5 space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                          <span>✓</span> Replied by You
                        </span>
                        <p className="text-xs font-medium text-emerald-950">
                          {item.repliedText}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={draftVal}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Type a professional response, or click AI Draft Reply..."
                          className="w-full rounded-2xl border border-line bg-white p-3 text-xs text-ink placeholder:text-ink-faint focus:outline-teal-600 focus:ring-1 focus:ring-teal-600"
                        />

                        {cardError && (
                          <p className="text-xs font-semibold text-rose-600">{cardError}</p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleDraft(item.id)}
                            disabled={isDrafting}
                            className="rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                          >
                            {isDrafting ? "✨ Drafting with Gemini..." : "✨ AI Draft Reply"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSend(item.id)}
                            disabled={isSending}
                            className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-black transition cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            {isSending ? "Sending..." : "Send Reply →"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
