"use client";

import { useState, type ReactNode, type InputHTMLAttributes } from "react";

interface AuthTextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style"> {
  label: string;
  accent: string;
  icon?: ReactNode;
}

export function AuthTextInput({ label, accent, icon, ...inputProps }: AuthTextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="mb-4">
      <label
        className="block text-xs font-medium text-[#9ca3af] mb-[7px]"
        style={{ letterSpacing: "0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div
            className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
            style={{ color: focused ? accent : "#4b5563" }}
          >
            {icon}
          </div>
        )}
        <input
          {...inputProps}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          className="w-full rounded-xl bg-white/[0.03] text-[#f9fafb] text-sm outline-none transition-all duration-300"
          style={{
            padding: icon ? "12px 16px 12px 42px" : "12px 16px",
            border: `1px solid ${focused ? accent + "50" : "rgba(255,255,255,0.08)"}`,
            boxShadow: focused ? `0 0 0 3px ${accent}12, 0 0 20px ${accent}06` : "none",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        />
      </div>
    </div>
  );
}
