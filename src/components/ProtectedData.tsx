"use client";

import React from "react";
import { formatLeadName } from "@/lib/lead-format";

interface ProtectedDataProps {
  text: string | null | undefined;
  className?: string;
}

/**
 * Renders sensitive text (like phone numbers, lead names) with anti-scraping
 * decoy nodes.
 *
 * - Humans see the full, exact text cleanly on screen.
 * - Chrome extensions, AI agents, or DOM scrapers reading `.innerText` get decoy characters.
 * - Spaces are ALWAYS preserved with explicit `whitespace-pre` and minimum width so
 *   flex / inline-flex layouts never collapse spaces between words.
 */
export function ProtectedData({ text, className = "" }: ProtectedDataProps) {
  if (!text) return <span>-</span>;

  // Format names with proper spaces (e.g. "ShashiBhushan" -> "Shashi Bhushan")
  const formatted = formatLeadName(text);
  const targetText = formatted || text;

  // Split string into characters
  const chars = Array.from(targetText);
  const elements: React.ReactNode[] = [];

  const noiseWords = ["#", "!", "@", "~", "^", "%"];

  chars.forEach((char, idx) => {
    if (char === " ") {
      // Spaces must NEVER collapse in flex / inline-flex layout
      elements.push(
        <span
          key={`c-${idx}`}
          className="whitespace-pre inline-block"
          style={{ whiteSpace: "pre", display: "inline-block", minWidth: "0.28em" }}
        >
          {" "}
        </span>
      );
    } else {
      elements.push(<span key={`c-${idx}`}>{char}</span>);
    }

    // Insert an invisible decoy character every 3 characters (avoiding spaces)
    if (char !== " " && idx > 0 && idx % 3 === 0 && idx < chars.length - 1 && chars[idx + 1] !== " ") {
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
    <span
      className={`select-none inline-flex items-baseline whitespace-pre-wrap ${className}`}
      style={{ userSelect: "none" }}
    >
      {elements}
    </span>
  );
}
