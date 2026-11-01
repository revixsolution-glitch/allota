"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface HumanVerificationCaptchaProps {
  onVerify: (token: string) => void;
  onReset?: () => void;
  isVerified: boolean;
}

interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

export function HumanVerificationCaptcha({
  onVerify,
  onReset,
  isVerified,
}: HumanVerificationCaptchaProps) {
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sliderX, setSliderX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number>(0);
  const trajectoryRef = useRef<TrajectoryPoint[]>([]);

  // Fetch a new cryptographic challenge from the server
  const loadChallenge = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSliderX(0);
      onReset?.();

      const res = await fetch("/api/auth/captcha");
      const data = await res.json();

      if (res.ok && data.challengeToken) {
        setChallengeToken(data.challengeToken);
      } else {
        setErrorMsg(data?.error || "Failed to load security challenge");
      }
    } catch {
      setErrorMsg("Network error loading security challenge");
    } finally {
      setLoading(false);
    }
  }, [onReset]);

  useEffect(() => {
    if (!isVerified) {
      loadChallenge();
    }
  }, [isVerified, loadChallenge]);

  // Handle Drag Start
  function handleStart(clientX: number, clientY: number, isTrusted: boolean) {
    if (isVerified || verifying || loading || !challengeToken) return;
    if (!isTrusted) {
      setErrorMsg("Automated pointer detected.");
      return;
    }

    setIsDragging(true);
    setErrorMsg(null);
    dragStartX.current = clientX;
    trajectoryRef.current = [{ x: clientX, y: clientY, t: Date.now() }];
  }

  // Handle Drag Move
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !trackRef.current) return;

      const trackRect = trackRef.current.getBoundingClientRect();
      const maxSlide = trackRect.width - 48; // 48px slider knob
      const deltaX = clientX - dragStartX.current;
      const clampedX = Math.max(0, Math.min(deltaX, maxSlide));

      setSliderX(clampedX);
      trajectoryRef.current.push({ x: clientX, y: clientY, t: Date.now() });
    },
    [isDragging]
  );

  // Handle Drag End & Server Verification
  const handleEnd = useCallback(async () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (!challengeToken || !trackRef.current) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    const maxSlide = trackRect.width - 48;

    // If released before reaching near the end, reset back to start
    if (sliderX < maxSlide * 0.65) {
      setSliderX(0);
      setErrorMsg("Slide the button all the way to the right to verify.");
      return;
    }

    // Snap cleanly to completion
    setSliderX(maxSlide);
    setVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          finalX: Math.round(maxSlide),
          trajectory: trajectoryRef.current,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.humanToken) {
        onVerify(data.humanToken);
      } else {
        setErrorMsg(data?.error || "Verification failed. Please slide again.");
        setSliderX(0);
        setTimeout(() => {
          loadChallenge();
        }, 800);
      }
    } catch {
      setErrorMsg("Network error verifying challenge.");
      setSliderX(0);
      loadChallenge();
    } finally {
      setVerifying(false);
    }
  }, [isDragging, challengeToken, sliderX, onVerify, loadChallenge]);

  // Global mouse/touch move and up listeners during drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (isDragging) handleMove(e.clientX, e.clientY);
    }
    function onMouseUp() {
      if (isDragging) handleEnd();
    }
    function onTouchMove(e: TouchEvent) {
      if (isDragging && e.touches[0]) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
    function onTouchEnd() {
      if (isDragging) handleEnd();
    }

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div className="w-full space-y-2">
      <div
        ref={trackRef}
        className={`relative h-13 w-full rounded-2xl border transition-all overflow-hidden select-none flex items-center px-2 ${
          isVerified
            ? "border-emerald-400 bg-emerald-50/80 shadow-xs"
            : errorMsg
            ? "border-red-300 bg-red-50/50"
            : "border-slate-300/90 bg-slate-100/80 shadow-inner"
        }`}
      >
        {/* Progress Background */}
        <div
          className={`absolute left-0 top-0 bottom-0 transition-all ${
            isVerified ? "w-full bg-emerald-400/20" : "bg-purple-200/40"
          }`}
          style={{ width: isVerified ? "100%" : `${sliderX + 24}px` }}
        />

        {/* Center Label Text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-semibold">
          {isVerified ? (
            <span className="text-emerald-700 flex items-center gap-1.5 font-bold">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Human Verified (Anti-Bot Passed)
            </span>
          ) : verifying ? (
            <span className="text-purple-700 animate-pulse font-medium">Checking human motion telemetry...</span>
          ) : loading ? (
            <span className="text-slate-400">Loading security challenge...</span>
          ) : (
            <span className="text-slate-600 tracking-wide font-medium flex items-center gap-1">
              Slide button to the right to verify &rarr;
            </span>
          )}
        </div>

        {/* Slider Knob */}
        {!isVerified && (
          <div
            onMouseDown={(e) => handleStart(e.clientX, e.clientY, e.isTrusted)}
            onTouchStart={(e) => {
              if (e.touches[0]) handleStart(e.touches[0].clientX, e.touches[0].clientY, e.isTrusted);
            }}
            style={{ transform: `translateX(${sliderX}px)` }}
            className={`relative z-10 h-10 w-11 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md transition-shadow select-none ${
              verifying
                ? "bg-purple-600 text-white cursor-wait"
                : isDragging
                ? "bg-purple-700 text-white shadow-lg ring-2 ring-purple-400 scale-105"
                : "bg-white text-purple-700 border border-slate-200 hover:border-purple-400 hover:shadow-lg"
            }`}
          >
            {verifying ? (
              <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </div>
        )}

        {/* Refresh Challenge Button */}
        {!isVerified && !verifying && (
          <button
            type="button"
            onClick={loadChallenge}
            title="Refresh Security Puzzle"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-purple-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="text-[11px] font-medium text-red-600 pl-1 animate-fadeIn flex items-center gap-1">
          <span>⚠️</span> {errorMsg}
        </p>
      )}
    </div>
  );
}
