"use client";

import React, { useEffect } from "react";

interface SuccessAnimationProps {
  size?: number;
  vibrate?: boolean;
}

export default function SuccessAnimation({
  size = 80,
  vibrate = false,
}: SuccessAnimationProps) {
  useEffect(() => {
    if (vibrate && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(200);
    }
  }, [vibrate]);

  return (
    <div
      className="inline-flex items-center justify-center text-status-ok-fg motion-safe:animate-[terreno-pop_0.45s_cubic-bezier(0.22,1.2,0.36,1)_both] motion-reduce:animate-none"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden>
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 27l7 7 16-16"
        />
      </svg>
    </div>
  );
}
