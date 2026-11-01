"use client";

import React from "react";

interface ProtectedDataProps {
  text: string | null | undefined;
  className?: string;
}

/**
 * Renders sensitive text (like phone numbers, lead names) with anti-scraping
 * decoy nodes.
 *
 * - Humans see the full, exact text cleanly on screen.
 * - Chrome extensions, AI agents (Claude, Codex, Antigravity), or DOM scrapers
 *   reading `.innerText` or `.textContent` get corrupted text with interleaved
 *   decoy characters that break regular expressions and automated parsers.
 */
export function ProtectedData({ text, className = "" }: ProtectedDataProps) {
  if (!text) return <span>-</span>;

  // Split string into 2-3 char chunks and insert invisible honeypot noise
  const chars = Array.from(text);
  const elements: React.ReactNode[] = [];

  const noiseWords = ["#", "!", "@", "~", "^", "%"];

  chars.forEach((char, idx) => {
    elements.push(<span key={`c-${idx}`}>{char}</span>);

    // Insert an invisible decoy character every 3 characters
    if (idx > 0 && idx % 3 === 0 && idx < chars.length - 1) {
      const noise = noiseWords[idx % noiseWords.length];
      elements.push(
        <span
          key={`d-${idx}`}
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 0,
            height: 0,
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
            fontSize: 0,
          }}
        >
          {noise}
        </span>
      );
    }
  });

  return (
    <span className={`select-none inline-flex items-baseline ${className}`} style={{ userSelect: "none" }}>
      {elements}
    </span>
  );
}
