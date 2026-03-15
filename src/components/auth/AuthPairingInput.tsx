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
    value.slice(0, 3),
    value.slice(3, 6),
  ];

  const handleChange = (i: number, val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const newBlocks = [...blocks];
    newBlocks[i] = clean;
    onChange(newBlocks.join(""));
    if (clean.length === 3 && i < 1) {
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div className="flex gap-3 justify-center items-center mb-6">
      {blocks.map((block, i) => (
        <div key={i} className="flex items-center gap-3">
          <input
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            maxLength={3}
            value={block}
            onChange={(e) => handleChange(i, e.target.value)}
            placeholder="···"
            className="text-center text-lg font-semibold text-[#f9fafb] outline-none transition-all duration-300"
            style={{
              width: "90px",
              height: "52px",
              letterSpacing: "0.2em",
              borderRadius: "12px",
              background: block ? `${accent}08` : "rgba(255,255,255,0.03)",
              border: `1.5px solid ${block ? accent + "35" : "rgba(255,255,255,0.15)"}`,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          {i < 1 && <span className="text-[#2a3040] text-xl font-light">&mdash;</span>}
        </div>
      ))}
    </div>
  );
}
