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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "allota",
      text: "Namaste! Main Allota AI Assistant hoon. Mai aapke leads, call summaries, reorder alerts aur telephony intelligence mein madad kar sakti hoon. Aap kya check karna chahenge?",
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

  function handleSendMessage(userQuery?: string) {
    const textToSend = (userQuery || inputText).trim();
    if (!textToSend) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!userQuery) setInputText("");
    setIsThinking(true);

    setTimeout(() => {
      let reply = "I'm checking the Allota AI CRM intelligence engine...";
      let actionUrl: string | undefined = undefined;
      let actionLabel: string | undefined = undefined;

      const q = textToSend.toLowerCase();

      if (q.includes("call") || q.includes("summary") || q.includes("telephony") || q.includes("recording")) {
        reply = "Maine telephony logs check kiye hain. Allota AI par call recordings Google Drive se automatically sync ho rahi hain. Verbatim transcripts aur Hinglish summaries available hain, with lead classification tags (Hot, Warm, Dead).";
        actionUrl = "/admin/calls";
        actionLabel = "View AI Call Summaries →";
      } else if (q.includes("lead") || q.includes("hot") || q.includes("inquiry")) {
        reply = "Current lead pipeline active hai across Meta, IndiaMART, aur Website. High-intent 'Hot Leads' ko system instant follow-up ke liye prioritize karta hai. Aap reassign bhi kar sakte hain.";
        actionUrl = "/admin/leads";
        actionLabel = "Check Leads Management →";
      } else if (q.includes("reorder") || q.includes("cadence") || q.includes("order")) {
        reply = "Repeat orders Marg ERP & Busy ke purchase cadence data ke basis par track ho rahe hain. Due & Overdue franchise accounts ke liye 1-click WhatsApp reminders ready hain.";
        actionUrl = "/admin/reorders";
        actionLabel = "Open Reorder Cadence →";
      } else if (q.includes("credit") || q.includes("payment") || q.includes("recovery")) {
        reply = "Credit ledger accounts monitored hain. Overdue balances aur <=3 days remaining due dates par automated reminders schedule kiye ja sakte hain.";
        actionUrl = "/admin/credits";
        actionLabel = "Manage Credit Ledger →";
      } else if (q.includes("hello") || q.includes("hi") || q.includes("namaste")) {
        reply = "Hello! Kaise hain aap? Allota AI CRM ke dashboard par aap date filters (Today, Yesterday, Last Week, Custom) se metrics analyze kar sakte hain.";
        actionUrl = "/admin";
        actionLabel = "Open Allota AI Dashboard →";
      } else {
        reply = `Aapke sawaal "${textToSend}" par Allota AI telephony & commercial database updated hai. Aap quick links se direct module inspect kar sakte hain.`;
        actionUrl = "/admin";
        actionLabel = "Explore Dashboard →";
      }

      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "allota",
        text: reply,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        actionUrl,
        actionLabel,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsThinking(false);
    }, 700);
  }

  return (
    <>
      {/* 1. ANIMATED ALLOTA AI CHATBOT LAUNCHER BUTTON */}
      <div className="fixed right-4 sm:right-6 bottom-20 lg:bottom-6 z-40 flex flex-col items-end">
        {/* UPPER JUMPING TEXT PILL */}
        {!isOpen && (
          <div className="allota-jumping-pill mb-2 select-none pointer-events-auto cursor-pointer" onClick={() => setIsOpen(true)}>
            <span className="allota-pill-sparkle">✦</span>
            <span>Ask Allota AI</span>
          </div>
        )}

        {/* CUSTOM ANIMATED SVG BUTTON */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`allota-chat ${isOpen ? "allota-chat-open" : ""}`}
          aria-label={isOpen ? "Close Allota AI Chatbot" : "Open Allota AI Chatbot"}
          title={isOpen ? "Close Allota AI" : "Open Allota AI Assistant"}
        >
          <svg
            viewBox="0 0 110 110"
            className="allota-logo"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Premium Cosmic Blue-to-Purple Gradient */}
              <linearGradient id="allotaBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="48%" stopColor="#4338CA" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>

              {/* Glowing Glass Rim Gradient */}
              <linearGradient id="glassRim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#818CF8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.9" />
              </linearGradient>

              {/* Orange Allocation Paths Gradient */}
              <linearGradient id="allocationGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFB347" />
                <stop offset="100%" stopColor="#F2541B" />
              </linearGradient>

              {/* Orbiting Ring Gradients */}
              <linearGradient id="cyanRingGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>

              <linearGradient id="purpleRingGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#E879F9" />
                <stop offset="100%" stopColor="#9333EA" />
              </linearGradient>

              {/* 3D Orange Upper Badge Gradient */}
              <radialGradient id="orangeBadgeGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#FED7AA" />
                <stop offset="35%" stopColor="#FB923C" />
                <stop offset="85%" stopColor="#EA580C" />
                <stop offset="100%" stopColor="#C2410C" />
              </radialGradient>

              {/* Glowing Filters */}
              <filter id="orangeGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="purpleGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ======================================================= */}
            {/* 1. OUTER 2 RINGS ANIMATED IN CIRCLE ORBIT (USER REQ)   */}
            {/* ======================================================= */}
            {/* Ring 1: Cyan / Blue Outer Orbit */}
            <circle
              className="orbit-circle orbit-cyan"
              cx="55"
              cy="55"
              r="49"
              fill="none"
              stroke="url(#cyanRingGrad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="34 274"
              filter="url(#cyanGlow)"
            />

            {/* Ring 2: Purple / Magenta Outer Orbit */}
            <circle
              className="orbit-circle orbit-purple"
              cx="55"
              cy="55"
              r="51"
              fill="none"
              stroke="url(#purpleRingGrad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="42 278"
              strokeDashoffset="138"
              filter="url(#purpleGlow)"
            />

            {/* ======================================================= */}
            {/* 2. MAIN 3D GLOSSY ALLOTA SPHERICAL LAUNCHER BODY        */}
            {/* ======================================================= */}
            <circle
              cx="55"
              cy="55"
              r="41"
              fill="url(#allotaBg)"
              className="allota-bg"
            />

            {/* Glass Neon Rim Highlight */}
            <circle
              cx="55"
              cy="55"
              r="39.5"
              fill="none"
              stroke="url(#glassRim)"
              strokeWidth="1.8"
              opacity="0.85"
            />

            {/* Subtle Glass Bubble Specular Reflection Arc */}
            <path
              d="M 27 34 C 38 21, 68 20, 83 27"
              fill="none"
              stroke="white"
              strokeOpacity="0.35"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* ======================================================= */}
            {/* 3. ALLOCATION NETWORK PATHS ("A" SHAPE)                 */}
            {/* ======================================================= */}
            <g className="allocation-network">
              {/* Left flowing path: Admin -> Left Employee */}
              <path
                className="flow flow-left"
                d="M 49 44 C 39 51, 33 61, 29 72"
                fill="none"
                stroke="url(#allocationGrad)"
                strokeWidth="5"
                strokeLinecap="round"
              />

              {/* Right flowing path: Admin -> Right Employee */}
              <path
                className="flow flow-right"
                d="M 61 44 C 71 51, 77 61, 81 72"
                fill="none"
                stroke="url(#allocationGrad)"
                strokeWidth="5"
                strokeLinecap="round"
              />

              {/* "A" Crossbar Bridge */}
              <path
                className="crossbar"
                d="M 42 61 L 68 61"
                fill="none"
                stroke="url(#allocationGrad)"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
            </g>

            {/* ======================================================= */}
            {/* 4. THREE 3D NODES (ADMIN + 2 EMPLOYEES)                 */}
            {/* ======================================================= */}
            {/* TOP ADMIN NODE */}
            <g className="person admin">
              <circle cx="55" cy="29" r="7" fill="#FFFFFF" />
              <path
                d="M 44 42 Q 55 33 66 42"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>

            {/* LEFT EMPLOYEE NODE */}
            <g className="person employee employee-left">
              <circle cx="26" cy="76" r="6" fill="#FFFFFF" />
              <path
                d="M 17 89 Q 26 81 35 89"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>

            {/* RIGHT EMPLOYEE NODE */}
            <g className="person employee employee-right">
              <circle cx="84" cy="76" r="6" fill="#FFFFFF" />
              <path
                d="M 75 89 Q 84 81 93 89"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>

            {/* AI ALLOCATION LIGHT PULSE (FLOWING ADMIN -> TEAM) */}
            <circle
              className="ai-pulse pulse-left"
              cx="49"
              cy="44"
              r="3.2"
              fill="#FF9A3C"
              filter="url(#orangeGlow)"
            />

            <circle
              className="ai-pulse pulse-right"
              cx="61"
              cy="44"
              r="3.2"
              fill="#FF9A3C"
              filter="url(#orangeGlow)"
            />

            {/* ======================================================= */}
            {/* 5. UPPER CHAT BUBBLE BADGE WITH 3 DOTS (JUMPING)       */}
            {/* ======================================================= */}
            <g className="upper-badge-group">
              {/* Glowing 3D Orange Spherical Badge */}
              <circle
                cx="88"
                cy="22"
                r="11"
                fill="url(#orangeBadgeGrad)"
                filter="url(#orangeGlow)"
              />
              {/* Specular curved shine */}
              <path
                d="M 83 17 C 86 14, 91 14, 93 16"
                stroke="white"
                strokeWidth="1.2"
                strokeLinecap="round"
                fill="none"
                opacity="0.75"
              />
              {/* Three speech dots */}
              <circle className="speech-dot dot-1" cx="84" cy="22" r="1.4" fill="#FFFFFF" />
              <circle className="speech-dot dot-2" cx="88" cy="22" r="1.4" fill="#FFFFFF" />
              <circle className="speech-dot dot-3" cx="92" cy="22" r="1.4" fill="#FFFFFF" />
            </g>
          </svg>
        </button>
      </div>

      {/* 2. INTERACTIVE ALLOTA AI CHATBOT DRAWER / PANEL */}
      {isOpen && (
        <div className="fixed right-4 sm:right-6 bottom-24 lg:bottom-24 z-50 w-[92vw] sm:w-[410px] max-h-[82vh] h-[560px] flex flex-col rounded-3xl bg-white shadow-2xl border border-line overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white border-b border-purple-800/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image
                  src="/logo.png"
                  alt="Allota AI"
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-xl object-contain shadow-md shadow-purple-500/30"
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-black text-white">Allota AI Assistant</h3>
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.2 text-[9px] font-bold text-purple-200 border border-purple-500/30">
                    Online
                  </span>
                </div>
                <p className="text-[11px] text-purple-200/80">Telephony & Commercial Intelligence</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
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
                  <p>{msg.text}</p>

                  {msg.actionUrl && (
                    <div className="mt-2.5 pt-2 border-t border-purple-100">
                      <Link
                        href={msg.actionUrl}
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center gap-1 font-bold text-purple-700 hover:text-purple-900 transition text-[11px]"
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
              <div className="flex items-center gap-1.5 p-3 max-w-[120px] rounded-2xl bg-white border border-line shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
                <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div className="p-2.5 bg-white border-t border-line/60 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
            <button
              type="button"
              onClick={() => handleQuickPrompt("Summarize today's telephony calls")}
              className="shrink-0 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-2.5 py-1 font-bold text-purple-800 transition cursor-pointer"
            >
              📞 Today&apos;s Calls
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Show high-intent hot leads")}
              className="shrink-0 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-2.5 py-1 font-bold text-indigo-800 transition cursor-pointer"
            >
              🔥 Hot Leads
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Check pending reorders")}
              className="shrink-0 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 font-bold text-amber-800 transition cursor-pointer"
            >
              📦 Reorders
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt("Check credit recovery")}
              className="shrink-0 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1 font-bold text-emerald-800 transition cursor-pointer"
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
              placeholder="Ask Allota AI about calls, leads, orders..."
              className="flex-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink placeholder:text-ink-faint border border-line focus:outline-hidden focus:border-purple-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white disabled:opacity-40 hover:opacity-90 active:scale-95 transition cursor-pointer shadow-xs"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* 3. RAZOR-SHARP SCOPED CSS ANIMATIONS */}
      <style jsx global>{`
        /* Launcher Base Container */
        .allota-chat {
          width: 72px;
          height: 72px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          position: relative;
          filter:
            drop-shadow(0 14px 26px rgba(67, 56, 202, 0.38))
            drop-shadow(0 4px 10px rgba(15, 23, 42, 0.22));
          transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.35s ease;
          overflow: visible;
        }

        @media (min-width: 640px) {
          .allota-chat {
            width: 76px;
            height: 76px;
          }
        }

        .allota-chat:hover {
          transform: translateY(-5px) scale(1.06);
          filter:
            drop-shadow(0 20px 32px rgba(67, 56, 202, 0.45))
            drop-shadow(0 6px 14px rgba(15, 23, 42, 0.25));
        }

        .allota-chat:active {
          transform: scale(0.92);
        }

        .allota-chat-open {
          transform: rotate(4deg) scale(0.96);
        }

        .allota-logo {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        /* ============================================================ */
        /* USER REQUIREMENT: OUTER 2 RINGS ANIMATED IN CIRCLE ORBIT    */
        /* ============================================================ */
        .orbit-circle {
          transform-origin: 55px 55px;
          pointer-events: none;
        }

        /* Ring 1 (Cyan Orbit): Clockwise Continuous 360° Circular Orbit */
        .orbit-cyan {
          animation: orbitRotateCW 6s linear infinite;
        }

        /* Ring 2 (Purple Orbit): Counter-Clockwise 360° Circular Orbit */
        .orbit-purple {
          animation: orbitRotateCCW 8.5s linear infinite;
        }

        @keyframes orbitRotateCW {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes orbitRotateCCW {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        /* ============================================================ */
        /* USER REQUIREMENT: UPPER TEXT & BADGE KEEPS JUMPING & ANIMATED*/
        /* ============================================================ */
        /* Upper Jumping Text Pill above button */
        .allota-jumping-pill {
          padding: 5px 12px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(192, 132, 252, 0.5);
          box-shadow:
            0 4px 14px rgba(67, 56, 202, 0.35),
            0 0 10px rgba(56, 189, 248, 0.3);
          color: #FFFFFF;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          gap: 6px;
          animation: pillJumpBounce 2.4s ease-in-out infinite;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .allota-jumping-pill:hover {
          transform: translateY(-8px) scale(1.05);
          box-shadow:
            0 6px 18px rgba(67, 56, 202, 0.45),
            0 0 14px rgba(56, 189, 248, 0.45);
        }

        .allota-pill-sparkle {
          color: #FBBF24;
          font-size: 11px;
          animation: sparklePulse 1.4s ease-in-out infinite;
        }

        @keyframes pillJumpBounce {
          0%, 100% {
            transform: translateY(0);
          }
          26% {
            transform: translateY(-8px);
          }
          46% {
            transform: translateY(1.5px);
          }
          64% {
            transform: translateY(-3.5px);
          }
          82% {
            transform: translateY(0);
          }
        }

        @keyframes sparklePulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
        }

        /* Upper 3D Orange Spherical Chat Bubble Badge Jumping */
        .upper-badge-group {
          transform-origin: 88px 22px;
          animation: badgeJumpPhysics 2.4s ease-in-out infinite;
        }

        @keyframes badgeJumpPhysics {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          26% {
            transform: translateY(-9px) scale(1.1);
          }
          46% {
            transform: translateY(1.5px) scale(0.96);
          }
          64% {
            transform: translateY(-4px) scale(1.03);
          }
          82% {
            transform: translateY(0) scale(1);
          }
        }

        /* 3 Typing Dots inside the jumping bubble */
        .speech-dot {
          animation: dotBlink 1.4s ease-in-out infinite;
        }
        .dot-1 { animation-delay: 0s; }
        .dot-2 { animation-delay: 0.22s; }
        .dot-3 { animation-delay: 0.44s; }

        @keyframes dotBlink {
          0%, 100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-1.2px);
          }
        }

        /* ============================================================ */
        /* INTERNAL ALLOTA IDENTITY MOTION (ADMIN FLOAT, BREATH, FLOW)  */
        /* ============================================================ */
        /* Top Admin Node floating */
        .admin {
          transform-origin: 55px 36px;
          animation: adminFloat 3s ease-in-out infinite;
        }

        @keyframes adminFloat {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2.5px);
          }
        }

        /* Left & Right Employees subtle breathing */
        .employee-left,
        .employee-right {
          transform-box: fill-box;
          transform-origin: center;
          animation: teamBreathe 3s ease-in-out infinite;
        }

        .employee-right {
          animation-delay: 0.2s;
        }

        @keyframes teamBreathe {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }

        /* Allocation Paths Flow */
        .flow {
          stroke-dasharray: 7 8;
          animation: taskFlow 1.6s linear infinite;
        }

        .flow-right {
          animation-delay: 0.25s;
        }

        @keyframes taskFlow {
          from {
            stroke-dashoffset: 30;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        /* AI Moving Signal Pulses (Admin -> Employees) */
        .ai-pulse {
          opacity: 0;
        }

        .pulse-left {
          offset-path: path("M 49 44 C 39 51, 33 61, 29 72");
          animation: allocateTask 3.6s ease-in-out infinite;
        }

        .pulse-right {
          offset-path: path("M 61 44 C 71 51, 77 61, 81 72");
          animation: allocateTask 3.6s ease-in-out infinite;
          animation-delay: 1.8s;
        }

        @keyframes allocateTask {
          0% {
            offset-distance: 0%;
            opacity: 0;
            transform: scale(0.5);
          }
          14% {
            opacity: 1;
          }
          75% {
            opacity: 1;
            transform: scale(1.1);
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
            transform: scale(0.5);
          }
        }

        /* A Crossbar Bridge Pulse */
        .crossbar {
          opacity: 0.75;
          animation: intelligencePulse 2.5s ease-in-out infinite;
        }

        @keyframes intelligencePulse {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 5px #FF9A3C);
          }
        }

        /* Hover interactions */
        .allota-chat:hover .employee-left {
          transform: translate(-2px, 1px);
        }

        .allota-chat:hover .employee-right {
          transform: translate(2px, 1px);
        }

        .allota-chat:hover .crossbar {
          filter: drop-shadow(0 0 7px #FF9A3C);
        }

        /* Reduced motion accessibility */
        @media (prefers-reduced-motion: reduce) {
          .allota-chat *,
          .allota-chat,
          .allota-jumping-pill,
          .upper-badge-group,
          .orbit-circle {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
