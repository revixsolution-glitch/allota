"use client";

import { useState } from "react";

interface CheckboxCaptchaProps {
  onVerify: (token: string) => void;
  onReset?: () => void;
  isVerified: boolean;
}

export function CheckboxCaptcha({ onVerify, onReset, isVerified }: CheckboxCaptchaProps) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (isVerified || loading) return;

    setLoading(true);
    // Simulates quick client verification check
    setTimeout(() => {
      setLoading(false);
      const token = `allota_sec_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
      onVerify(token);
    }, 600);
  }

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`relative flex items-center justify-between rounded-2xl border p-3.5 sm:px-4 sm:py-3 transition-all cursor-pointer select-none ${
        isVerified
          ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400/30"
          : loading
          ? "border-purple-300 bg-purple-50/40"
          : "border-slate-300/90 bg-slate-50/70 hover:bg-slate-100/90 hover:border-slate-400 shadow-xs"
      }`}
    >
      {/* Left: Custom Styled Checkbox + Text */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all ${
            isVerified
              ? "border-emerald-500 bg-emerald-500 text-white shadow-xs scale-105"
              : loading
              ? "border-purple-500 bg-white"
              : "border-slate-400/80 bg-white hover:border-purple-500 shadow-inner"
          }`}
        >
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin text-purple-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isVerified ? (
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </div>

        <span className="text-xs font-semibold text-slate-700">
          {isVerified ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              ✓ Verification Passed
            </span>
          ) : loading ? (
            <span className="text-purple-700 font-medium">Verifying browser...</span>
          ) : (
            <span>I am not a robot</span>
          )}
        </span>
      </div>

      {/* Right: Security Badge Branding */}
      <div className="flex flex-col items-end pl-2">
        <div className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-[10px] font-bold text-slate-600 tracking-tight">
            Security Check
          </span>
        </div>
        <span className="text-[9px] text-slate-400 font-medium">Bot & AI Defense</span>
      </div>
    </div>
  );
}
