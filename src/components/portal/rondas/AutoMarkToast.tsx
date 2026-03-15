"use client";

import { useState, useEffect, useRef } from "react";

interface AutoMarkToastProps {
  checkpointName: string;
  onAddPhoto: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function AutoMarkToast({
  checkpointName,
  onAddPhoto,
  onDismiss,
  autoDismissMs = 5000,
}: AutoMarkToastProps) {
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = startRef.current;
    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / autoDismissMs) * 100);
      setProgress(pct);
      if (pct <= 0) {
        onDismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      className="fixed inset-x-4 z-[70] animate-in slide-in-from-top duration-300"
      style={{ top: "calc(var(--safe-area-top, 0px) + 1rem)" }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-green-700/50 bg-green-950/90 shadow-lg shadow-green-900/30 backdrop-blur-sm">
        {/* Progress bar */}
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-green-500/50 transition-none"
          style={{ width: `${progress}%` }}
        />

        <div className="flex items-center gap-3 px-4 py-3">
          {/* Animated checkmark */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              style={{ animation: "scale-check 0.3s ease-out" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-green-300">
              {checkpointName} marcado
            </p>
            <p className="text-xs text-green-400/60">Marcacion automatica por geocerca</p>
          </div>

          {/* Add photo button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              cancelAnimationFrame(rafRef.current);
              onAddPhoto();
            }}
            className="shrink-0 rounded-lg border border-green-600/40 bg-green-900/40 px-3 py-1.5 text-xs font-medium text-green-300 transition-colors active:bg-green-800/60"
          >
            Foto
          </button>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="shrink-0 text-green-500/40 hover:text-green-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-check {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
