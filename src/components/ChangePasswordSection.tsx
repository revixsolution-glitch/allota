"use client";

import { useState, useEffect } from "react";

export function ChangePasswordSection({ userEmail }: { userEmail?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendOtp = async () => {
    setStatus(null);
    setSendingOtp(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PASSWORD_UPDATE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to send verification code." });
      } else {
        setOtpSent(true);
        setResendCooldown(45);
        if (data.simulated && data.debugCode) {
          setStatus({
            type: "info",
            message: `${data.message} (Test OTP: ${data.debugCode} - configure SMTP in .env for production email)`,
          });
        } else {
          setStatus({ type: "info", message: data.message || "Verification code sent to your email." });
        }
      }
    } catch {
      setStatus({ type: "error", message: "Failed to connect to authentication server." });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!otpCode || otpCode.trim().length < 4) {
      setStatus({ type: "error", message: "Please enter the 6-digit verification code sent to your email." });
      return;
    }

    if (newPassword.length < 6) {
      setStatus({ type: "error", message: "New password must be at least 6 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, otpCode: otpCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to update password." });
      } else {
        setStatus({ type: "success", message: data.message || "Password updated successfully!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setOtpCode("");
        setOtpSent(false);
      }
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl p-6 neo-panel bg-white border border-line space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
            <span>🔐</span> Account &amp; Password Security
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Logged in as <strong className="text-ink">{userEmail || "Administrator"}</strong>. All password updates require 2-step email verification via OTP.
          </p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold">
          Email OTP Protected
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        {status && (
          <div
            className={`rounded-2xl p-3 text-xs font-semibold ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : status.type === "info"
                ? "bg-teal-50 text-teal-800 border border-teal-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {status.message}
          </div>
        )}

        {/* Step 1: Request Email OTP */}
        <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-ink">
                Step 1: Verify Identity via Registered Email
              </p>
              <p className="text-[11px] text-ink-muted">
                A 6-digit verification code will be sent to <strong>{userEmail}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sendingOtp || resendCooldown > 0}
              className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition disabled:opacity-50 shrink-0 cursor-pointer"
            >
              {sendingOtp
                ? "Sending..."
                : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : otpSent
                ? "Resend Code"
                : "Send Verification Code"}
            </button>
          </div>

          {otpSent && (
            <div className="pt-2">
              <label className="block text-[11px] font-bold text-teal-900 mb-1">
                Enter 6-Digit Email OTP
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 482915"
                required
                className="w-48 rounded-xl border border-teal-300 bg-white px-3.5 py-2 text-sm text-teal-950 font-mono tracking-widest placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
              />
            </div>
          )}
        </div>

        {/* Step 2: Passwords */}
        <div>
          <label className="block text-xs font-bold text-ink mb-1">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your existing password"
            required
            className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              className="w-full rounded-xl border border-line bg-slate-50 px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !otpSent || otpCode.length < 4}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? "Verifying OTP & Saving..." : "Verify OTP & Update Password"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
