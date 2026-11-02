"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { GlobalTopBarActions } from "@/components/GlobalTopBarActions";
import { WhatsAppCompanionSection } from "@/components/WhatsAppCompanionSection";

interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  title,
  portalType = "Admin",
  navItems,
  showWhatsAppConnector = false,
  employeePhone,
  children,
}: {
  title: string;
  portalType?: "Admin" | "Employee";
  navItems: NavItem[];
  showWhatsAppConnector?: boolean;
  employeePhone?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<"CONNECTED" | "NOT_CONNECTED">("NOT_CONNECTED");

  useEffect(() => {
    if (!showWhatsAppConnector) return;
    async function checkWa() {
      try {
        const res = await fetch("/api/whatsapp-companion/pair");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "CONNECTED") setWhatsAppStatus("CONNECTED");
          else setWhatsAppStatus("NOT_CONNECTED");
        }
      } catch {}
    }
    checkWa();
  }, [showWhatsAppConnector]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed even if network drops
    }
    // Hard navigate to completely purge client memory and Next.js router cache
    window.location.replace("/login");
  }

  // Determine quick bottom bar tabs
  const isEmployee = portalType === "Employee";
  const bottomNavShortcuts = isEmployee
    ? [
        { href: "/employee", label: "Workdesk" },
        { href: "/employee/leads", label: "Leads" },
        { href: "/employee/clients", label: "Clients" },
      ]
    : [
        ...(navItems.some((item) => item.href === "/admin")
          ? [{ href: "/admin", label: "Dashboard" }]
          : []),
        { href: "/admin/leads", label: "Lead Center" },
        { href: "/admin/employees", label: "Reps" },
        { href: "/admin/calls", label: "Calls" },
      ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-canvas">
      {/* ============================================================ */}
      {/* 1. MOBILE TOP APP BAR (Screens < 1024px)                     */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-white/95 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md shadow-xs lg:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink neo-button active:scale-95 transition"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/logo.png"
              alt="Allota AI"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-lg object-contain"
              priority
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-ink leading-tight">Allota AI</p>
              <p className="truncate text-[10px] font-semibold text-primary uppercase tracking-wider" title={title}>
                {title}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
            {portalType.toUpperCase()}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 neo-button active:scale-95 transition disabled:opacity-50"
          >
            {loggingOut ? (
              <svg className="h-4 w-4 animate-spin text-rose-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. MOBILE SLIDE-OUT DRAWER OVERLAY & PANEL                   */}
      {/* ============================================================ */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-76 max-w-[85vw] h-[100dvh] flex-col bg-canvas p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] neo-panel shadow-2xl transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto overscroll-contain ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-3 rounded-2xl p-3 neo-pressed">
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src="/logo.png"
              alt="Allota AI"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-xl object-contain shadow-xs"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">Allota AI</p>
              <p className="truncate text-xs font-semibold text-primary" title={title}>{title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation drawer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <div className="mt-5 flex-1">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Navigation Menu
          </p>
          <nav className="mt-2 space-y-1.5">
            {navItems.map((item) => {
              const isActive =
                item.href === "/admin" || item.href === "/employee"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-primary to-primary-strong text-white shadow-md"
                      : "text-ink-muted neo-button hover:bg-gradient-to-r hover:from-primary/10 hover:via-primary-soft/40 hover:to-teal/10 hover:text-primary hover:border-primary/25"
                  }`}
                >
                  <NavIcon href={item.href} active={isActive} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            {showWhatsAppConnector && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setWhatsAppModalOpen(true);
                  }}
                  className={`w-full flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all duration-300 cursor-pointer active:scale-98 ${
                    whatsAppStatus === "CONNECTED"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm shadow-emerald-600/25"
                      : "bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-900 border border-emerald-200/80 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl p-1 ${
                        whatsAppStatus === "CONNECTED"
                          ? "bg-white/20 text-white"
                          : "bg-white border border-emerald-200/80 shadow-2xs"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4.5 w-4.5">
                        <path fill="#25D366" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/>
                        <path fill="#fff" d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.27-.2-.57-.35z"/>
                      </svg>
                    </div>
                    <span className="truncate">
                      {whatsAppStatus === "CONNECTED" ? "WhatsApp Connected" : "Connect WhatsApp"}
                    </span>
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      whatsAppStatus === "CONNECTED"
                        ? "bg-white animate-pulse ring-2 ring-white/50"
                        : "bg-slate-300 ring-2 ring-emerald-100"
                    }`}
                  />
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Drawer User Footer */}
        <div className="mt-auto pt-4 border-t border-line/60">
          <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 neo-pressed">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700 font-bold text-xs shrink-0">
                {portalType === "Admin" ? "AD" : "EM"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink truncate">
                  {portalType === "Admin" ? "Admin Master" : "Field Agent"}
                </p>
                <p className="text-[10px] text-ink-faint">Active Mobile Session</p>
              </div>
            </div>
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary shrink-0">
              {portalType.toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-rose-600 neo-button hover:bg-rose-50 transition disabled:opacity-50"
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. DESKTOP SIDEBAR (Screens >= 1024px)                        */}
      {/* ============================================================ */}
      <aside className="hidden lg:flex m-4 w-68 flex-col rounded-3xl p-5 neo-panel shrink-0">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 rounded-2xl p-3 neo-pressed">
          <Image
            src="/logo.png"
            alt="Allota AI"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-xs"
            priority
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <p className="truncate text-sm font-bold tracking-tight text-ink">Allota AI</p>
            </div>
            <p className="truncate text-xs font-medium text-primary" title={title}>
              {title}
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
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-primary to-primary-strong text-white shadow-[0px_4px_16px_rgba(2,132,199,0.3)]"
                      : "text-ink-muted neo-button hover:bg-gradient-to-r hover:from-primary/10 hover:via-primary-soft/40 hover:to-teal/10 hover:text-primary hover:border-primary/25 hover:shadow-xs"
                  }`}
                >
                  <NavIcon href={item.href} active={isActive} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            {showWhatsAppConnector && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setWhatsAppModalOpen(true)}
                  className={`w-full flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all duration-300 cursor-pointer active:scale-98 ${
                    whatsAppStatus === "CONNECTED"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm shadow-emerald-600/25"
                      : "bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-900 border border-emerald-200/80 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl p-1 ${
                        whatsAppStatus === "CONNECTED"
                          ? "bg-white/20 text-white"
                          : "bg-white border border-emerald-200/80 shadow-2xs"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4.5 w-4.5">
                        <path fill="#25D366" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/>
                        <path fill="#fff" d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.27-.2-.57-.35z"/>
                      </svg>
                    </div>
                    <span className="truncate">
                      {whatsAppStatus === "CONNECTED" ? "WhatsApp Connected" : "Connect WhatsApp"}
                    </span>
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      whatsAppStatus === "CONNECTED"
                        ? "bg-white animate-pulse ring-2 ring-white/50"
                        : "bg-slate-300 ring-2 ring-emerald-100"
                    }`}
                  />
                </button>
              </div>
            )}
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
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-rose-600 neo-button hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors disabled:opacity-50"
          >
            {loggingOut ? (
              <span className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing out...
              </span>
            ) : (
              <>
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
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 4. MAIN CONTENT VIEWPORT (Responsive Padding & Max-Width)   */}
      {/* ============================================================ */}
      <main className="min-w-0 flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8 w-full max-w-full overflow-x-hidden">
        {/* Global Top Action Bar Across All Pages (Notification Bell + Date Filter) */}
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-line/60 pb-3 sm:pb-3.5">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-primary">
              {portalType} Workspace
            </span>
            <span className="text-ink-faint text-xs">•</span>
            <span className="text-xs font-semibold text-ink-muted truncate max-w-[130px] sm:max-w-none">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
            <GlobalTopBarActions />
          </div>
        </div>

        {children}
      </main>

      {/* ============================================================ */}
      {/* 5. MOBILE BOTTOM THUMB NAVIGATION BAR (Screens < 1024px)     */}
      {/* ============================================================ */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] items-center justify-around border-t border-line/80 bg-white/95 backdrop-blur-md px-1 shadow-lg lg:hidden">
        {bottomNavShortcuts.map((item) => {
          const isActive =
            item.href === "/admin" || item.href === "/employee"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition ${
                isActive
                  ? "text-primary font-bold"
                  : "text-ink-muted hover:text-ink font-medium"
              }`}
            >
              <div className={`p-1 rounded-xl transition ${isActive ? "bg-primary-soft text-primary" : ""}`}>
                <NavIcon href={item.href} active={isActive} />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}

        {/* More / Menu Drawer Trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1.5 text-ink-muted hover:text-ink transition"
        >
          <div className="p-1 rounded-xl">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
          <span className="text-[10px] font-medium tracking-tight mt-0.5">More</span>
        </button>
      </nav>

      {/* WhatsApp Modal Popup Centered in Middle Screen */}
      {whatsAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0 cursor-pointer"
            onClick={() => setWhatsAppModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl">
            <WhatsAppCompanionSection
              initialPhone={employeePhone}
              onClose={() => setWhatsAppModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const strokeColor = active ? "currentColor" : "currentColor";

  if (href.includes("social-inbox")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-sky-500"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    );
  }

  if (href === "/admin" || href === "/employee") {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-primary"}`}
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

  if (href.includes("calls")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-rose-600"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
        />
      </svg>
    );
  }

  if (href.includes("insights")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-purple-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-teal-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-emerald-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-teal-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-indigo-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-teal-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-emerald-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-slate-600"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-amber-600"}`}
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

  if (href.includes("follow-ups")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-sky-500"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2Z"
        />
      </svg>
    );
  }

  if (href.includes("dead-leads")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-rose-500"}`}
        fill="none"
        stroke={strokeColor}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01"
        />
      </svg>
    );
  }

  if (href.includes("leads")) {
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-amber-500"}`}
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
    return (
      <svg
        className={`h-5 w-5 ${active ? "text-white lg:text-white" : "text-purple-600"}`}
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
