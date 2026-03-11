"use client";

import { useRef } from "react";

interface AuthPairingInputProps {
  accent: string;
  value: string; // 6 chars max
  onChange: (code: string) => void;
}

export function AuthPairingInput({ accent, value, onChange }: AuthPairingInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const blocks = [
    value.slice(0, 2),
    value.slice(2, 4),
    value.slice(4, 6),
  ];

  const handleChange = (i: number, val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
    const newBlocks = [...blocks];
    newBlocks[i] = clean;
    onChange(newBlocks.join(""));
    if (clean.length === 2 && i < 2) {
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center items-center mb-6">
      {blocks.map((block, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            maxLength={2}
            value={block}
            onChange={(e) => handleChange(i, e.target.value)}
            placeholder="··"
            className="text-center text-base font-semibold text-[#f9fafb] outline-none transition-all duration-300"
            style={{
              width: "64px",
              height: "52px",
              letterSpacing: "0.15em",
              borderRadius: "12px",
              background: block ? `${accent}08` : "rgba(255,255,255,0.03)",
              border: `1.5px solid ${block ? accent + "35" : "rgba(255,255,255,0.15)"}`,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          {i < 2 && <span className="text-[#2a3040] text-base">&mdash;</span>}
        </div>
      ))}
    </div>
  );
}
