"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PuzzleCaptchaProps {
  onVerify: (token: string) => void;
  onReset?: () => void;
  isVerified: boolean;
}

export function PuzzleCaptcha({ onVerify, onReset, isVerified }: PuzzleCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const pieceCanvasRef = useRef<HTMLCanvasElement>(null);

  const [targetX, setTargetX] = useState<number>(140);
  const [targetY, setTargetY] = useState<number>(40);
  const [sliderX, setSliderX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "success" | "failed">("idle");
  const [shake, setShake] = useState<boolean>(false);

  const pieceSize = 42;
  const canvasWidth = 320;
  const canvasHeight = 130;
  const maxDrag = canvasWidth - pieceSize - 16;

  // Function to draw standard jigsaw puzzle shape
  const drawPuzzleShape = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    const r = s / 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Top tab
    ctx.lineTo(x + s / 2 - r, y);
    ctx.arc(x + s / 2, y - r, r, Math.PI, 0, false);
    ctx.lineTo(x + s, y);
    // Right tab
    ctx.lineTo(x + s, y + s / 2 - r);
    ctx.arc(x + s + r, y + s / 2, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x + s, y + s);
    // Bottom slot (inward)
    ctx.lineTo(x + s / 2 + r, y + s);
    ctx.arc(x + s / 2, y + s - r, r, 0, Math.PI, true);
    ctx.lineTo(x, y + s);
    // Left edge
    ctx.lineTo(x, y);
    ctx.closePath();
  }, []);

  // Initialize or reset puzzle graphic with randomized target position
  const initPuzzle = useCallback(() => {
    setStatus("idle");
    setSliderX(0);

    // Randomize target position (safe margins from edges)
    const newTargetX = Math.floor(Math.random() * (canvasWidth - pieceSize - 120)) + 80;
    const newTargetY = Math.floor(Math.random() * (canvasHeight - pieceSize - 30)) + 15;
    setTargetX(newTargetX);
    setTargetY(newTargetY);

    const bgCanvas = bgCanvasRef.current;
    const pieceCanvas = pieceCanvasRef.current;
    if (!bgCanvas || !pieceCanvas) return;

    const bgCtx = bgCanvas.getContext("2d");
    const pieceCtx = pieceCanvas.getContext("2d");
    if (!bgCtx || !pieceCtx) return;

    // 1. Draw procedural pharma-tech security gradient background
    bgCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Gradient
    const grad = bgCtx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    const hues = [
      ["#1e1b4b", "#4338ca", "#06b6d4"],
      ["#0f172a", "#3b82f6", "#10b981"],
      ["#311042", "#7c3aed", "#ec4899"],
      ["#042f2e", "#0d9488", "#38bdf8"],
    ];
    const pickedHue = hues[Math.floor(Math.random() * hues.length)];
    grad.addColorStop(0, pickedHue[0]);
    grad.addColorStop(0.5, pickedHue[1]);
    grad.addColorStop(1, pickedHue[2]);
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Tech grid overlay
    bgCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    bgCtx.lineWidth = 1;
    for (let x = 0; x < canvasWidth; x += 20) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, canvasHeight);
      bgCtx.stroke();
    }
    for (let y = 0; y < canvasHeight; y += 20) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(canvasWidth, y);
      bgCtx.stroke();
    }

    // Pharma molecular nodes & connection lines
    bgCtx.fillStyle = "rgba(255, 255, 255, 0.6)";
    bgCtx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    const nodes = [
      { x: 40, y: 30, r: 4 },
      { x: 100, y: 80, r: 6 },
      { x: 160, y: 40, r: 5 },
      { x: 220, y: 90, r: 7 },
      { x: 280, y: 35, r: 4 },
      { x: 70, y: 110, r: 5 },
      { x: 250, y: 115, r: 5 },
    ];
    for (let i = 0; i < nodes.length - 1; i++) {
      bgCtx.beginPath();
      bgCtx.moveTo(nodes[i].x, nodes[i].y);
      bgCtx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
      bgCtx.stroke();
    }
    nodes.forEach((n) => {
      bgCtx.beginPath();
      bgCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      bgCtx.fill();
    });

    // Branding watermark
    bgCtx.fillStyle = "rgba(255, 255, 255, 0.35)";
    bgCtx.font = "bold 11px system-ui, sans-serif";
    bgCtx.fillText("ALLOTA AI • VERIFY HUMAN", 15, canvasHeight - 12);

    // 2. Cutout the target notch on background
    bgCtx.save();
    bgCtx.fillStyle = "rgba(15, 23, 42, 0.75)";
    drawPuzzleShape(bgCtx, newTargetX, newTargetY, pieceSize);
    bgCtx.fill();
    bgCtx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    bgCtx.setLineDash([4, 3]);
    bgCtx.lineWidth = 1.5;
    bgCtx.stroke();
    bgCtx.restore();

    // 3. Render the floating piece on pieceCanvas
    pieceCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    pieceCtx.save();
    drawPuzzleShape(pieceCtx, newTargetX, newTargetY, pieceSize);
    pieceCtx.clip();
    
    // Copy background slice to piece
    pieceCtx.drawImage(bgCanvas, 0, 0);
    pieceCtx.restore();

    // Outline and shadow for the piece
    pieceCtx.save();
    drawPuzzleShape(pieceCtx, newTargetX, newTargetY, pieceSize);
    pieceCtx.strokeStyle = "#ffffff";
    pieceCtx.lineWidth = 2;
    pieceCtx.shadowColor = "rgba(0, 0, 0, 0.6)";
    pieceCtx.shadowBlur = 8;
    pieceCtx.stroke();
    pieceCtx.restore();
  }, [drawPuzzleShape, canvasWidth, canvasHeight, pieceSize]);

  useEffect(() => {
    initPuzzle();
  }, [initPuzzle]);

  // Handle Dragging (Mouse & Touch)
  const handleStart = (clientX: number) => {
    if (isVerified || status === "success") return;
    setIsDragging(true);
    setDragStartX(clientX - sliderX);
  };

  const handleMove = useCallback((clientX: number) => {
    if (!isDragging || isVerified) return;
    const currentX = clientX - dragStartX;
    const clampedX = Math.max(0, Math.min(currentX, maxDrag));
    setSliderX(clampedX);
  }, [isDragging, isVerified, dragStartX, maxDrag]);

  const handleEnd = useCallback(() => {
    if (!isDragging || isVerified) return;
    setIsDragging(false);

    // Calculate match tolerance (allow +/- 6px precision)
    const diff = Math.abs(sliderX - targetX);
    if (diff <= 6) {
      setSliderX(targetX); // Snap exactly to target
      setStatus("success");
      
      // Generate secure verification token
      const token = `allota_sec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      onVerify(token);
    } else {
      setStatus("failed");
      setShake(true);
      setTimeout(() => {
        setShake(false);
        initPuzzle();
        if (onReset) onReset();
      }, 700);
    }
  }, [isDragging, isVerified, sliderX, targetX, onVerify, onReset, initPuzzle]);

  // Global mouse/touch release listener
  useEffect(() => {
    const onGlobalMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX);
    };
    const onGlobalMouseUp = () => handleEnd();
    const onGlobalTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onGlobalMouseMove);
      window.addEventListener("mouseup", onGlobalMouseUp);
      window.addEventListener("touchmove", onGlobalTouchMove);
      window.addEventListener("touchend", onGlobalTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onGlobalMouseMove);
      window.removeEventListener("mouseup", onGlobalMouseUp);
      window.removeEventListener("touchmove", onGlobalTouchMove);
      window.removeEventListener("touchend", onGlobalTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border p-3 bg-slate-50/80 transition-all select-none ${
        isVerified || status === "success"
          ? "border-emerald-300 bg-emerald-50/40"
          : status === "failed"
          ? "border-rose-300 bg-rose-50/40"
          : "border-slate-200"
      } ${shake ? "animate-bounce" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🛡️</span>
          <span className="text-[11px] font-bold text-slate-700">
            Security Check • Bot & AI Prevention
          </span>
        </div>
        <button
          type="button"
          onClick={initPuzzle}
          disabled={isVerified}
          className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded cursor-pointer disabled:opacity-30"
          title="Refresh Puzzle"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Visual Canvas Area */}
      <div className="relative w-full h-[130px] rounded-xl overflow-hidden shadow-inner border border-slate-300/60 bg-slate-900">
        {/* Background Canvas */}
        <canvas
          ref={bgCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full h-full object-cover"
        />

        {/* Floating Puzzle Piece Canvas */}
        <div
          className="absolute top-0 left-0 h-full pointer-events-none transition-transform duration-75"
          style={{
            transform: `translateX(${sliderX - targetX}px)`,
          }}
        >
          <canvas
            ref={pieceCanvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="w-full h-full"
          />
        </div>

        {/* Success Overlay Banner */}
        {(isVerified || status === "success") && (
          <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex items-center justify-center gap-2 text-emerald-300 font-bold text-xs animate-in fade-in duration-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">
              ✓
            </span>
            <span>Human Verification Passed</span>
          </div>
        )}
      </div>

      {/* Interactive Slider Track */}
      <div className="relative mt-2.5 h-10 w-full rounded-xl bg-slate-200/80 border border-slate-300/80 overflow-hidden flex items-center">
        {/* Progress fill */}
        <div
          className={`absolute left-0 top-0 bottom-0 transition-all ${
            isVerified || status === "success"
              ? "bg-emerald-500"
              : status === "failed"
              ? "bg-rose-400"
              : "bg-gradient-to-r from-purple-600 to-indigo-600"
          }`}
          style={{
            width: `${((sliderX + 20) / maxDrag) * 100}%`,
          }}
        />

        {/* Helper Instructions Label */}
        <span className="relative z-10 w-full text-center text-[11px] font-semibold text-slate-600 pointer-events-none">
          {isVerified || status === "success"
            ? "✓ Verified Successfully"
            : status === "failed"
            ? "✕ Misaligned, retrying..."
            : isDragging
            ? "Release to snap in place"
            : "Slide right to solve puzzle →"}
        </span>

        {/* Draggable Slider Thumb */}
        <div
          onMouseDown={(e) => handleStart(e.clientX)}
          onTouchStart={(e) => {
            if (e.touches.length > 0) handleStart(e.touches[0].clientX);
          }}
          className={`absolute top-0.5 bottom-0.5 z-20 flex w-10 items-center justify-center rounded-lg shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
            isVerified || status === "success"
              ? "bg-emerald-600 text-white cursor-default"
              : "bg-white text-purple-700 hover:bg-slate-50 active:scale-95 border border-slate-300/60"
          }`}
          style={{
            left: `${sliderX}px`,
          }}
        >
          {isVerified || status === "success" ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
