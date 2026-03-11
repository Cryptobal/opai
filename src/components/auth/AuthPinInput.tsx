"use client";

import { useRef, useState } from "react";

interface AuthPinInputProps {
  length?: number;
  accent: string;
  value: string;
  onChange: (pin: string) => void;
}

export function AuthPinInput({ length = 4, accent, value, onChange }: AuthPinInputProps) {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const pins = value.padEnd(length, "").split("").slice(0, length);

  const handleChange = (i: number, val: string) => {
    if (val.length > 1 || (val && !/^\d$/.test(val))) return;
    const next = [...pins];
    next[i] = val;
    onChange(next.join(""));
    if (val && i < length - 1) {
      refs.current[i + 1]?.focus();
      setFocusedIdx(i + 1);
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pins[i] && i > 0) {
      refs.current[i - 1]?.focus();
      setFocusedIdx(i - 1);
    }
  };

  return (
    <div className="flex gap-3 justify-center mb-6">
      {pins.map((p, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={p}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={() => setFocusedIdx(i)}
          className="text-center text-2xl font-bold text-[#f9fafb] outline-none transition-all duration-300"
          style={{
            width: "56px",
            height: "64px",
            borderRadius: "14px",
            background: p ? `${accent}12` : "rgba(255,255,255,0.06)",
            border: `2px solid ${focusedIdx === i ? accent : p ? accent + "50" : "rgba(255,255,255,0.25)"}`,
            boxShadow: focusedIdx === i ? `0 0 0 3px ${accent}20, 0 0 20px ${accent}10` : "none",
            transform: p ? "scale(1.02)" : "scale(1)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        />
      ))}
    </div>
  );
}
