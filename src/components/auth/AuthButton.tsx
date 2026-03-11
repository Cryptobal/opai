"use client";

import { useState, type ButtonHTMLAttributes } from "react";

interface AuthButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> {
  accent: string;
  loading?: boolean;
  label: string;
}

export function AuthButton({ accent, loading, label, ...buttonProps }: AuthButtonProps) {
  const [hov, setHov] = useState(false);

  return (
    <button
      {...buttonProps}
      disabled={loading || buttonProps.disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="w-full py-[13px] px-6 rounded-xl border-none cursor-pointer text-white text-sm font-semibold transition-all duration-300"
      style={{
        background: hov ? accent : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        transform: hov ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hov ? `0 8px 30px ${accent}35` : `0 4px 15px ${accent}20`,
        letterSpacing: "0.01em",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
          />
          Ingresando...
        </span>
      ) : (
        label
      )}
    </button>
  );
}
