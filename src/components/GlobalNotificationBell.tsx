"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CrmNotification } from "@/app/api/notifications/route";

export function GlobalNotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readIds, setReadIds] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [home, setHome] = useState<{ href: string; label: string }>({
    href: "/admin/calls",
    label: "View Telephony & CRM Alerts →",
  });
  const [toast, setToast] = useState<CrmNotification | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Pop-up + desktop alert the first time a follow-up becomes due (once per reminder, per browser tab session).
  function alertForDueFollowUps(list: CrmNotification[]) {
    let alerted: string[] = [];
    try {
      alerted = JSON.parse(sessionStorage.getItem("allota_alerted_followups") || "[]");
    } catch {}
    const fresh = list.filter((n) => n.type === "FOLLOWUP" && n.dueAt && !alerted.includes(n.id));
    if (fresh.length === 0) return;
    try {
      sessionStorage.setItem("allota_alerted_followups", JSON.stringify([...alerted, ...fresh.map((n) => n.id)]));
    } catch {}
    const first = fresh[0];
    setToast(fresh.length > 1 ? { ...first, title: `${fresh.length} follow-ups are due`, description: fresh.map((n) => n.title.split(": ")[1] ?? "").filter(Boolean).slice(0, 3).join(", ") } : first);
    setTimeout(() => setToast(null), 10000);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(fresh.length > 1 ? `${fresh.length} follow-ups are due` : first.title, {
          body: fresh.length > 1 ? "Open Allota to see them." : first.description,
        });
      } catch {}
    }
  }

  async function enableDesktopAlerts() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

  // Load read notifications from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("allota_read_notifications");
      if (stored) {
        setReadIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Fetch live notifications
  useEffect(() => {
    let isMounted = true;
    async function fetchNotifications() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          if (data.home) setHome({ href: data.home, label: data.homeLabel || "View alerts →" });
          alertForDueFollowUps(data.notifications);
          const unread = data.notifications.filter(
            (n: CrmNotification) => !readIds.includes(n.id)
          ).length;
          setUnreadCount(unread);
        }
      } catch (err) {
        console.warn("Failed to fetch notifications:", err);
      }
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s auto-refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [readIds]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  function handleMarkAllRead() {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    setUnreadCount(0);
    try {
      localStorage.setItem("allota_read_notifications", JSON.stringify(allIds));
    } catch {}
  }

  function handleItemClick(id: string) {
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      setUnreadCount(Math.max(0, unreadCount - 1));
      try {
        localStorage.setItem("allota_read_notifications", JSON.stringify(updated));
      } catch {}
    }
    setIsOpen(false);
  }

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative inline-flex items-center" ref={dropdownRef}>
      {/* Animated Bell Button in CRM Blue */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        title={hasUnread ? `${unreadCount} new notifications` : "Notifications"}
        className={`relative flex h-8.5 w-8.5 items-center justify-center rounded-full bg-white border border-line shadow-xs transition cursor-pointer hover:border-[#0284c7] hover:bg-sky-50/50 ${
          isOpen ? "ring-2 ring-[#0284c7]/30 border-[#0284c7]" : ""
        }`}
      >
        {/* Animated Bell Icon */}
        <svg
          className={`h-4.5 w-4.5 text-[#0284c7] transition-transform ${
            hasUnread ? "allota-bell-ringing" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* CRM Blue Badge Counter / Pulse Ring */}
        {hasUnread && (
          <>
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0284c7] px-1 text-[9px] font-black text-white ring-2 ring-white shadow-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#0284c7] opacity-75 animate-ping pointer-events-none" />
          </>
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-3 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-96 max-w-[calc(100vw-24px)] rounded-3xl bg-white shadow-2xl border border-line overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-b border-line">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black">Notifications</span>
              {hasUnread && (
                <span className="rounded-full bg-[#0284c7] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount} New
                </span>
              )}
            </div>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[10px] font-bold text-sky-200 hover:text-white underline underline-offset-2 cursor-pointer transition"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-line/60">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-faint">
                <span className="text-lg block mb-1">🎉</span>
                All caught up! No pending alerts.
              </div>
            ) : (
              notifications.map((item) => {
                const isItemUnread = !readIds.includes(item.id);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => handleItemClick(item.id)}
                    className={`flex items-start gap-3 p-3 transition hover:bg-slate-50 cursor-pointer ${
                      isItemUnread ? "bg-sky-50/40" : ""
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {item.type === "CALL" ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                          📞
                        </div>
                      ) : item.type === "FOLLOWUP" ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                          ⏰
                        </div>
                      ) : item.type === "LEAD" ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                          🔥
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                          💳
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs truncate ${isItemUnread ? "font-bold text-ink" : "font-medium text-ink-muted"}`}>
                          {item.title}
                        </p>
                        <span className="text-[10px] text-ink-faint shrink-0">{item.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-ink-faint line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                    {isItemUnread && (
                      <span className="h-2 w-2 rounded-full bg-[#0284c7] shrink-0 mt-1.5" />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border-t border-line">
            <Link
              href={home.href}
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-bold text-[#0284c7] hover:underline"
            >
              {home.label}
            </Link>
            {notifPermission === "default" && (
              <button
                type="button"
                onClick={enableDesktopAlerts}
                className="text-[10px] font-bold text-ink-muted underline underline-offset-2 hover:text-ink cursor-pointer"
              >
                Enable desktop alerts
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <Link
          href={toast.href}
          onClick={() => setToast(null)}
          className="fixed right-4 top-20 z-[60] flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border border-sky-200 bg-white p-3.5 shadow-2xl"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-lg">⏰</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-extrabold text-ink">{toast.title}</span>
            <span className="mt-0.5 block text-[11px] text-ink-muted">{toast.description}</span>
          </span>
        </Link>
      )}

      {/* Bell Ringing Animation Style */}
      <style jsx global>{`
        .allota-bell-ringing {
          animation: bellSwing 4.5s ease-in-out infinite;
          transform-origin: top center;
        }

        @keyframes bellSwing {
          0%, 100% {
            transform: rotate(0deg);
          }
          3% {
            transform: rotate(15deg);
          }
          6% {
            transform: rotate(-13deg);
          }
          9% {
            transform: rotate(11deg);
          }
          12% {
            transform: rotate(-9deg);
          }
          15% {
            transform: rotate(6deg);
          }
          18% {
            transform: rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}
