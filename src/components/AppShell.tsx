"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  title,
  portalType = "Admin",
  navItems,
  children,
}: {
  title: string;
  portalType?: "Admin" | "Employee";
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sleek Neumorphic Sidebar with Color Accents */}
      <aside className="m-4 flex w-68 flex-col rounded-3xl p-5 neo-panel shrink-0">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 rounded-2xl p-3 neo-pressed">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-primary to-indigo-600 text-white shadow-md shadow-primary/25">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="truncate text-sm font-bold tracking-tight text-ink" title={title}>
                {title}
              </p>
            </div>
            <p className="truncate text-xs font-medium text-primary">
              {portalType} Portal
            </p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="mt-6 flex-1">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Main Navigation
          </p>
          <nav className="mt-2 space-y-2">
            {navItems.map((item) => {
              const isActive =
                item.href === "/admin" || item.href === "/employee"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive
                      ? "flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-primary-strong px-4 py-3 text-sm font-semibold text-white shadow-[0px_4px_16px_rgba(2,132,199,0.3)] transition-all"
                      : "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink-muted neo-button hover:text-primary hover:border-primary/30 transition-all"
                  }
                >
                  <NavIcon href={item.href} active={isActive} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer with Role Badge & Logout */}
        <div className="mt-auto pt-4 border-t border-line/60">
          <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 neo-pressed">
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700 font-bold text-xs shrink-0">
                {portalType === "Admin" ? "AD" : "EM"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink leading-tight truncate">
                  {portalType === "Admin" ? "Admin Master" : "Field Agent"}
                </p>
                <p className="text-[10px] text-ink-faint">Active Session</p>
              </div>
            </div>
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary shrink-0">
              {portalType.toUpperCase()}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-rose-600 neo-button hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const strokeColor = active ? "currentColor" : "currentColor";

  if (href === "/admin" || href === "/employee") {
    // Dashboard / Grid Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-primary"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    );
  }

  if (href.includes("insights")) {
    // AI Insights / Brain / Analytics Sparkle Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-purple-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    );
  }

  if (href.includes("stock")) {
    // Stock IQ / Pharma Inventory & Box Management Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-teal-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    );
  }

  if (href.includes("credits")) {
    // Credit Management / Credit Card & Ledger Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-emerald-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    );
  }

  if (href.includes("territories")) {
    // Map / Pin Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-teal-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    );
  }

  if (href.includes("clients")) {
    // Building / Clients Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-indigo-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    );
  }

  if (href.includes("leads-iq")) {
    // Leads IQ / Lead Velocity Analytics Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-teal-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    );
  }

  if (href.includes("sources")) {
    // Multi-Channel Sources & Upload Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-emerald-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    );
  }

  if (href.includes("settings")) {
    // Settings & Plan Configurator Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-slate-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    );
  }

  if (href.includes("leads-reassign")) {
    // Leads Reassign / Transfer / Two-way swap Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-amber-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    );
  }

  if (href.includes("leads")) {
    // Target / Funnel Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-amber-500"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    );
  }

  if (href.includes("employees")) {
    // Team / Users Icon
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white" : "text-purple-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    );
  }

  return (
    <span
      className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-primary"}`}
    />
  );
}
