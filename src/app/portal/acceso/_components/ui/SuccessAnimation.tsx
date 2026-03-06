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
      className="inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        className="success-checkmark"
        viewBox="0 0 52 52"
        width={size}
        height={size}
      >
        <circle
          className="success-checkmark__circle"
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="#10B981"
          strokeWidth="2"
        />
        <path
          className="success-checkmark__check"
          fill="none"
          stroke="#10B981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 27l7 7 16-16"
        />
      </svg>

      <style jsx>{`
        .success-checkmark__circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: stroke-circle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }

        .success-checkmark__check {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: stroke-check 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
        }

        @keyframes stroke-circle {
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes stroke-check {
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
