"use client";

import React, { useState } from "react";

interface SecretInputProps {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export function SecretInput({
  name,
  defaultValue = "",
  placeholder = "",
  className = "",
  readOnly = false,
}: SecretInputProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [val, setVal] = useState(defaultValue || "");

  function handleCopy() {
    if (val && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="relative flex items-center">
      <input
        type={visible ? "text" : "password"}
        name={name}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full rounded-xl border border-line bg-white px-3 py-1.5 pr-16 text-xs text-ink placeholder:text-ink-faint font-mono focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
      />
      <div className="absolute right-1.5 flex items-center gap-1">
        {val && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy value"
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
          >
            {copied ? "✓" : "📋"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          title={visible ? "Hide" : "Show"}
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
        >
          {visible ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );
}
