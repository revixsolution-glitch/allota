"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@pharmacrm.test");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function performLogin(loginEmail: string, loginPass: string) {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      setLoading(false);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Invalid credentials. Please try again.");
        return;
      }

      const data = await res.json();
      if (data.role === "SUPER_ADMIN") {
        router.push("/super-admin");
      } else if (data.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/employee");
      }
      router.refresh();
    } catch {
      setLoading(false);
      setError("Network error connecting to server. Please try again.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await performLogin(email, password);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-3xl p-8 neo-panel border border-line/60 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Allota AI"
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl object-contain shadow-md shadow-purple-500/20"
              priority
            />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Allota AI</h1>
          <p className="mt-1 text-xs text-ink-faint">Telephony Intelligence & PCD Pharma Commercial OS • allota.in</p>
        </div>

        {/* 1-Click Quick Demo Login Shortcuts */}
        <div className="mb-6 space-y-2 rounded-2xl bg-slate-50/80 p-3.5 border border-line">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted text-center">
            ⚡ Quick 1-Click Demo Login
          </p>
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail("superadmin@pharmacrm.com");
                setPassword("superadmin123");
                performLogin("superadmin@pharmacrm.com", "superadmin123");
              }}
              className="flex flex-col items-center justify-center rounded-xl bg-purple-700 px-2 py-2 text-center text-white transition hover:bg-purple-800 disabled:opacity-50 shadow-sm"
            >
              <span className="text-[11px] font-bold">Super Admin</span>
              <span className="text-[9px] text-white/80">Owner Deck</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail("admin@pharmacrm.test");
                setPassword("admin123");
                performLogin("admin@pharmacrm.test", "admin123");
              }}
              className="flex flex-col items-center justify-center rounded-xl bg-primary px-2 py-2 text-center text-white transition hover:bg-primary-strong disabled:opacity-50 shadow-sm"
            >
              <span className="text-[11px] font-bold">Client Admin</span>
              <span className="text-[9px] text-white/80">Allota AI</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail("employee@pharmacrm.test");
                setPassword("employee123");
                performLogin("employee@pharmacrm.test", "employee123");
              }}
              className="flex flex-col items-center justify-center rounded-xl bg-slate-800 px-2 py-2 text-center text-white transition hover:bg-slate-900 disabled:opacity-50 shadow-sm"
            >
              <span className="text-[11px] font-bold">Field Rep</span>
              <span className="text-[9px] text-white/80">Rep Portal</span>
            </button>
          </div>
        </div>

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line/60" />
          </div>
          <span className="relative bg-white px-3 text-[11px] font-bold uppercase text-ink-faint">
            or enter credentials
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-bold text-ink-muted"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
              placeholder="admin@pharmacrm.test"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-bold text-ink-muted"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-center text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-ink py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-md"
          >
            {loading ? "Signing in..." : "Sign in to Dashboard →"}
          </button>
        </form>

        <div className="mt-5 border-t border-line/60 pt-3 text-center text-[11px] text-ink-faint">
          Password for both test accounts is <code className="rounded bg-slate-100 px-1 py-0.5 text-ink font-mono font-bold">admin123</code> / <code className="rounded bg-slate-100 px-1 py-0.5 text-ink font-mono font-bold">employee123</code>
        </div>
      </div>
    </main>
  );
}
