"use client";

import { useState, Suspense, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { PuzzleCaptcha } from "@/components/PuzzleCaptcha";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showDemo = searchParams.get("demo") === "true" || searchParams.get("demo") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [botTrap, setBotTrap] = useState("");
  const [tapCount, setTapCount] = useState(0);
  const [showDemoLocal, setShowDemoLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isDemoActive = showDemo || showDemoLocal;

  function handleLogoClick() {
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setShowDemoLocal((v) => !v);
        return 0;
      }
      return next;
    });
  }

  async function performLogin(loginEmail: string, loginPass: string, bypassCaptcha = false) {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bypassCaptcha ? { "x-demo-bypass": "true" } : {}),
        },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPass,
          captchaToken: bypassCaptcha ? "allota_sec_demo_bypass" : captchaToken,
          _hp: botTrap,
        }),
      });

      setLoading(false);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Invalid email or password. Please check your credentials.");
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
      setError("Network connection error. Please verify your internet and try again.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both your work email and password.");
      return;
    }
    if (!isVerified || !captchaToken) {
      setError("Please solve the security puzzle to verify you are human.");
      return;
    }
    await performLogin(email, password);
  }

  return (
    <div className="w-full max-w-md rounded-3xl p-8 sm:p-9 bg-white border border-slate-200/80 shadow-2xl shadow-slate-900/5">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div
          onClick={handleLogoClick}
          className="mx-auto mb-3.5 flex items-center justify-center cursor-pointer select-none active:scale-95 transition-transform"
          title="Allota AI"
        >
          <Image
            src="/logo.png"
            alt="Allota AI"
            width={56}
            height={56}
            className="h-14 w-14 rounded-2xl object-contain shadow-lg shadow-purple-500/20"
            priority
          />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Allota AI
        </h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Pharmaceutical Commercial Intelligence OS
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Sign in to access your organization workspace
        </p>
      </div>

      {/* Quick Test Login (Visible via ?demo=true or triple-tapping the logo) */}
      {isDemoActive && (
        <div className="mb-6 space-y-2 rounded-2xl bg-purple-50/70 p-3.5 border border-purple-200/70 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
              🛠️ Quick Test Login
            </span>
            <button
              type="button"
              onClick={() => setShowDemoLocal(false)}
              className="text-[10px] text-purple-600 hover:text-purple-800 font-bold cursor-pointer"
            >
              ✕ Hide
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => performLogin("superadmin@pharmacrm.com", "superadmin123", true)}
              className="rounded-xl bg-purple-700 px-2 py-1.5 text-center text-white text-[11px] font-bold hover:bg-purple-800 disabled:opacity-50 cursor-pointer"
            >
              Super Admin
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => performLogin("admin@pharmacrm.test", "admin123", true)}
              className="rounded-xl bg-indigo-600 px-2 py-1.5 text-center text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              Client Admin
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => performLogin("employee@pharmacrm.test", "employee123", true)}
              className="rounded-xl bg-slate-800 px-2 py-1.5 text-center text-white text-[11px] font-bold hover:bg-slate-900 disabled:opacity-50 cursor-pointer"
            >
              Field Rep
            </button>
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hidden Honeypot Input for Bot Detection */}
        <input
          type="text"
          name="_hp"
          value={botTrap}
          onChange={(e) => setBotTrap(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />

        <div>
          <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5">
            Work Email Address
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
              </svg>
            </div>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-slate-300/80 bg-slate-50/50 py-2.5 pl-10 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300/80 bg-slate-50/50 py-2.5 pl-10 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Bot & AI Prevention Slider Puzzle */}
        <div className="pt-1">
          <PuzzleCaptcha
            isVerified={isVerified}
            onVerify={(token) => {
              setCaptchaToken(token);
              setIsVerified(true);
              setError(null);
            }}
            onReset={() => {
              setCaptchaToken(null);
              setIsVerified(false);
            }}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-center text-xs font-semibold text-rose-700 shadow-xs flex items-center justify-center gap-1.5">
            <svg className="h-4 w-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 py-2.5 text-xs font-bold text-white shadow-md shadow-slate-900/10 hover:from-purple-950 hover:to-slate-900 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Authenticating Workspace...</span>
            </>
          ) : (
            <>
              <span>Sign In to Workspace</span>
              <span className="text-purple-300">→</span>
            </>
          )}
        </button>
      </form>

      {/* Security & Support Footer */}
      <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>256-Bit SSL Encrypted Enterprise Workspace</span>
        </div>
        <p className="text-[10px] text-slate-400">
          Need access or password assistance? Contact your organization administrator.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Suspense fallback={<div className="text-xs text-slate-400">Loading workspace portal...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
