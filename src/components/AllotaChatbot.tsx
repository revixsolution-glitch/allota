"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface ChatMessage {
  id: string;
  sender: "user" | "allota";
  text: string;
  timestamp: string;
  actionUrl?: string;
  actionLabel?: string;
}

export function AllotaChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ dailyUsed: number; dailyCap: number; remaining: number }>({
    dailyUsed: 0,
    dailyCap: 1500,
    remaining: 1500,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "allota",
      text: "Namaste! Main Allota AI Assistant hoon (powered by Gemini Flash). Mai aapke telephony calls, leads, reorder cadence aur credit ledger mein live assist kar sakti hoon. Aap kya check karna chahenge?",
      timestamp: "Just now",
      actionUrl: "/admin/calls",
      actionLabel: "Open Telephony Hub →",
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  function handleQuickPrompt(prompt: string) {
    handleSendMessage(prompt);
  }

  async function handleSendMessage(userQuery?: string) {
    const textToSend = (userQuery || inputText).trim();
    if (!textToSend || isThinking) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!userQuery) setInputText("");
    setIsThinking(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-4),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.usage) {
        setQuotaInfo(data.usage);
      }

      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "allota",
        text: data.reply || "I am analyzing the latest Allota AI records...",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "allota",
        text: "Network error connecting to Allota Gemini engine. Please try again in a moment.",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <>
      {/* ============================================================ */}
      {/* 1. FLOATING 3D ANIMATED ALLOTA AI CHATBOT LAUNCHER           */}
      {/* ============================================================ */}
      <div className="fixed right-4 sm:right-6 bottom-20 lg:bottom-6 z-40 flex flex-col items-end pointer-events-auto">
        
        {/* UPPER JUMPING TEXT PILL (USER REQ: UPPER TEXT KEEPS JUMPING & ANIMATED) */}
        {!isOpen && (
          <div
            onClick={() => setIsOpen(true)}
            className="allota-jumping-text mb-1.5 select-none cursor-pointer flex items-center gap-1.5"
            title="Click to chat with Allota AI"
          >
            <span className="text-[#FFB347] animate-pulse text-xs">✦</span>
            <span>Ask Allota AI</span>
          </div>
        )}

        {/* EXACT 3D LAUNCHER BUTTON CONTAINER */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`allota-3d-launcher group ${isOpen ? "allota-launcher-active" : ""}`}
          aria-label={isOpen ? "Close Allota AI Chatbot" : "Open Allota AI Chatbot"}
          title={isOpen ? "Close Allota AI" : "Open Allota AI Assistant (Gemini Flash)"}
        >
          {/* A. OUTER 2 RINGS ANIMATED IN CIRCLE ORBIT (USER REQ) */}
          <div className="allota-orbit-layer">
            <Image
              src="/allota-orbit-rings.png"
              alt="Orbiting Neon Rings"
              width={96}
              height={96}
              className="allota-orbiting-rings"
              priority
            />
            {/* Neon SVG Glow Track that continuously rotates 360° in orbit */}
            <svg
              viewBox="0 0 100 100"
              className="allota-svg-orbit"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeDasharray="26 260"
                className="svg-orbit-cyan"
              />
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke="#C084FC"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeDasharray="32 260"
                strokeDashoffset="130"
                className="svg-orbit-purple"
              />
            </svg>
          </div>

          {/* B. EXACT 3D VOLUMETRIC GLASS ORB */}
          <div className="allota-core-orb-wrapper">
            <Image
              src="/allota-3d-orb.png"
              alt="Allota AI 3D Identity"
              width={82}
              height={82}
              className="allota-core-orb-img"
              priority
            />
          </div>

          {/* C. UPPER 3D ORANGE CHAT BUBBLE BADGE (JUMPING & ANIMATED) */}
          <div className="allota-jumping-badge">
            <Image
              src="/allota-speech-badge.png"
              alt="Chat Indicator"
              width={26}
              height={26}
              className="allota-badge-img"
              priority
            />
            {/* Pulsing 3 dots inside badge */}
            <div className="allota-badge-dots">
              <span className="b-dot b-dot-1" />
              <span className="b-dot b-dot-2" />
              <span className="b-dot b-dot-3" />
            </div>
          </div>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 2. INTERACTIVE GEMINI-POWERED CHATBOT DRAWER / PANEL         */}
      {/* ============================================================ */}
      {isOpen && (
        <div className="fixed right-4 sm:right-6 bottom-24 lg:bottom-24 z-50 w-[92vw] sm:w-[420px] max-h-[82vh] h-[580px] flex flex-col rounded-3xl bg-white shadow-2xl border border-line overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white border-b border-purple-800/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image
                  src="/logo.png"
                  alt="Allota AI"
                  width={38}
                  height={38}
                  className="h-9 w-9 rounded-xl object-contain shadow-md shadow-purple-500/30"
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-white">Allota AI Copilot</h3>
                  <span className="rounded-full bg-purple-500/25 px-2 py-0.2 text-[9px] font-extrabold text-purple-200 border border-purple-500/30">
                    Gemini Flash
                  </span>
                </div>
                <p className="text-[11px] text-purple-200/80">Telephony & Commercial Intelligence</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Daily Usage Cap Indicator (Gemini Free Tier) */}
              <span
                className="hidden sm:inline-block rounded-lg bg-white/10 px-2 py-1 text-[10px] font-mono text-purple-200 border border-white/15"
                title="Daily Free Gemini Tier Quota (1,500 requests/day)"
              >
                {quotaInfo.remaining} / {quotaInfo.dailyCap} left
              </span>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-gradient-to-r from-primary to-indigo-600 text-white rounded-br-xs shadow-xs"
                      : "bg-white text-ink border border-line rounded-bl-xs shadow-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {msg.actionUrl && (
                    <div className="mt-2.5 pt-2 border-t border-purple-100">
                      <Link
                        href={msg.actionUrl}
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center gap-1 font-extrabold text-purple-700 hover:text-purple-900 transition text-[11px]"
                      >
                        <span>{msg.actionLabel || "Open in CRM →"}</span>
                      </Link>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-ink-faint px-1 mt-1">{msg.timestamp}</span>
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-2 p-3 max-w-[140px] rounded-2xl bg-white border border-line shadow-2xs">
                <span className="text-[10px] font-bold text-purple-700">Allota thinking</span>
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div className="p-2.5 bg-white border-t border-line/60 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
            <button
              type="button"
              onClick={() => handleQuickPrompt("Summarize today's telephony calls and status")}
              className="shrink-0 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 font-bold text-purple-800 transition cursor-pointer"
            >
              📞 Today&apos;s Calls
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Show our high-intent hot leads in the pipeline")}
              className="shrink-0 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 font-bold text-indigo-800 transition cursor-pointer"
            >
              🔥 Hot Leads
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Check pending reorders and cadence alerts")}
              className="shrink-0 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 font-bold text-amber-800 transition cursor-pointer"
            >
              📦 Reorders
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Check overdue accounts in credit ledger")}
              className="shrink-0 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 font-bold text-emerald-800 transition cursor-pointer"
            >
              💳 Credits
            </button>
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-line flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask Allota AI (Gemini Flash)..."
              disabled={isThinking}
              className="flex-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink placeholder:text-ink-faint border border-line focus:outline-hidden focus:border-purple-500 transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isThinking}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white disabled:opacity-40 hover:opacity-90 active:scale-95 transition cursor-pointer shadow-xs"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>

          {/* Footer Quota Info */}
          <div className="px-3 py-1 bg-slate-100 border-t border-line/40 text-[9px] text-ink-faint flex items-center justify-between">
            <span>Powered by Google Gemini 2.5 Flash</span>
            <span>Free Tier: 1,500 queries/day max</span>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. RAZOR-SHARP CSS ANIMATIONS & ORBIT PHYSICS                */}
      {/* ============================================================ */}
      <style jsx global>{`
        /* Launcher Button Container */
        .allota-3d-launcher {
          width: 78px;
          height: 78px;
          position: relative;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @media (min-width: 640px) {
          .allota-3d-launcher {
            width: 84px;
            height: 84px;
          }
        }

        .allota-3d-launcher:hover {
          transform: translateY(-4px) scale(1.05);
        }

        .allota-3d-launcher:active {
          transform: scale(0.93);
        }

        .allota-launcher-active {
          transform: rotate(4deg) scale(0.96);
        }

        /* A. OUTER 2 RINGS ANIMATED IN CIRCULAR ORBIT */
        .allota-orbit-layer {
          position: absolute;
          inset: -4px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          transform-origin: center center;
          animation: orbitRotateCW 6.5s linear infinite;
        }

        .allota-orbiting-rings {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.6)) drop-shadow(0 0 8px rgba(192, 132, 252, 0.5));
        }

        .allota-svg-orbit {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform-origin: center center;
          pointer-events: none;
        }

        .svg-orbit-cyan {
          filter: drop-shadow(0 0 4px #38BDF8);
        }

        .svg-orbit-purple {
          filter: drop-shadow(0 0 4px #C084FC);
        }

        @keyframes orbitRotateCW {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* B. CORE 3D ORB WRAPPER */
        .allota-core-orb-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          filter:
            drop-shadow(0 12px 24px rgba(67, 56, 202, 0.38))
            drop-shadow(0 4px 10px rgba(15, 23, 42, 0.25));
        }

        .allota-core-orb-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        /* C. UPPER 3D ORANGE CHAT BUBBLE BADGE (JUMPING & ANIMATED) */
        .allota-jumping-badge {
          position: absolute;
          top: 0px;
          right: 0px;
          width: 25px;
          height: 25px;
          z-index: 2;
          pointer-events: none;
          transform-origin: center bottom;
          animation: badgeJumpPhysics 2.3s ease-in-out infinite;
          filter: drop-shadow(0 0 7px rgba(251, 146, 60, 0.8));
        }

        .allota-badge-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .allota-badge-dots {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
        }

        .b-dot {
          width: 2.2px;
          height: 2.2px;
          border-radius: 50%;
          background: #FFFFFF;
          animation: bDotPulse 1.4s ease-in-out infinite;
        }

        .b-dot-1 { animation-delay: 0s; }
        .b-dot-2 { animation-delay: 0.22s; }
        .b-dot-3 { animation-delay: 0.44s; }

        @keyframes bDotPulse {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-0.8px); }
        }

        @keyframes badgeJumpPhysics {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          26% {
            transform: translateY(-8px) scale(1.1);
          }
          46% {
            transform: translateY(1.5px) scale(0.96);
          }
          64% {
            transform: translateY(-3.5px) scale(1.03);
          }
          82% {
            transform: translateY(0) scale(1);
          }
        }

        /* D. UPPER JUMPING TEXT PILL (USER REQ: UPPER TEXT KEEPS JUMPING & ANIMATED) */
        .allota-jumping-text {
          padding: 5px 12px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(192, 132, 252, 0.5);
          box-shadow:
            0 4px 14px rgba(67, 56, 202, 0.35),
            0 0 10px rgba(56, 189, 248, 0.3);
          color: #FFFFFF;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.02em;
          animation: textJumpPhysics 2.3s ease-in-out infinite;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .allota-jumping-text:hover {
          transform: translateY(-6px) scale(1.05);
          box-shadow:
            0 6px 20px rgba(67, 56, 202, 0.45),
            0 0 14px rgba(56, 189, 248, 0.4);
        }

        @keyframes textJumpPhysics {
          0%, 100% {
            transform: translateY(0);
          }
          26% {
            transform: translateY(-7px);
          }
          46% {
            transform: translateY(1.5px);
          }
          64% {
            transform: translateY(-3px);
          }
          82% {
            transform: translateY(0);
          }
        }

        /* Accessibility: reduce motion if user prefers */
        @media (prefers-reduced-motion: reduce) {
          .allota-orbit-layer,
          .allota-jumping-badge,
          .allota-jumping-text,
          .b-dot {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
