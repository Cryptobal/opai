"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  FileCheck,
  BarChart3,
  MapPin,
  MessageSquare,
  FileBarChart,
  Rocket,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TOUR_STEPS_PROSPECT } from "./tour-steps";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  FileCheck,
  BarChart3,
  MapPin,
  MessageSquare,
  FileBarChart,
  Rocket,
};

interface Props {
  onComplete: () => void;
}

export function TourOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [animKey, setAnimKey] = useState(0);
  const steps = TOUR_STEPS_PROSPECT;
  const current = steps[step];
  const Icon = ICON_MAP[current.icon] || Shield;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  const next = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setDirection("next");
      setAnimKey((k) => k + 1);
      setStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const prev = useCallback(() => {
    if (!isFirst) {
      setDirection("prev");
      setAnimKey((k) => k + 1);
      setStep((s) => s - 1);
    }
  }, [isFirst]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onComplete();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onComplete]);

  // Swipe support for mobile
  useEffect(() => {
    let startX = 0;
    function handleTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
    }
    function handleTouchEnd(e: TouchEvent) {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 60) {
        if (diff > 0) next();
        else prev();
      }
    }
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [next, prev]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
    >
      {/* Card */}
      <div
        key={animKey}
        className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(165deg, #1a2332 0%, #0f172a 100%)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(45,212,191,0.08)",
          animation:
            direction === "next"
              ? "tourEnterRight 0.35s cubic-bezier(0.16,1,0.3,1)"
              : "tourEnterLeft 0.35s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5 pb-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > step ? "next" : "prev");
                setAnimKey((k) => k + 1);
                setStep(i);
              }}
              className="group relative p-1"
              aria-label={`Paso ${i + 1}`}
            >
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: i === step ? 24 : 8,
                  backgroundColor:
                    i === step
                      ? "#2dd4bf"
                      : i < step
                        ? "rgba(45,212,191,0.4)"
                        : "rgba(255,255,255,0.1)",
                }}
              />
            </button>
          ))}
        </div>

        {/* Icon area with gradient background */}
        <div className="px-8 pt-4 pb-2">
          <div
            className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br ${current.accent} flex items-center justify-center`}
            style={{
              animation: "tourIconPulse 0.5s cubic-bezier(0.16,1,0.3,1)",
              border: "1px solid rgba(45,212,191,0.15)",
            }}
          >
            <Icon className="w-10 h-10 text-teal-400" />
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pt-4 pb-2 text-center">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-teal-400/70 mb-2">
            {current.subtitle}
          </p>
          <h3
            className="text-xl sm:text-2xl font-bold text-white mb-3 leading-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            {current.title}
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-sm mx-auto">
            {current.content}
          </p>
        </div>

        {/* Step counter */}
        <div className="text-center pt-3 pb-1">
          <span className="text-[11px] text-zinc-600 tabular-nums">
            {step + 1} / {steps.length}
          </span>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3 px-6 pb-4 pt-2">
          {!isFirst ? (
            <button
              onClick={prev}
              className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-10" />
          )}

          <button
            onClick={next}
            className="flex-1 h-12 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
            style={{
              background: isLast
                ? "linear-gradient(135deg, #0d9488, #14b8a6, #2dd4bf)"
                : "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.08))",
              color: isLast ? "#042f2e" : "#2dd4bf",
              border: isLast ? "none" : "1px solid rgba(45,212,191,0.2)",
              boxShadow: isLast ? "0 4px 20px rgba(45,212,191,0.3)" : "none",
            }}
          >
            <span className="flex items-center justify-center gap-2">
              {isLast ? "Comenzar a explorar" : "Siguiente"}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </span>
          </button>
        </div>

        {/* Skip */}
        <div className="text-center pb-5">
          <button
            onClick={onComplete}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors py-1 px-4"
          >
            Saltar tour
          </button>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes tourEnterRight {
          from { opacity: 0; transform: translateX(40px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes tourEnterLeft {
          from { opacity: 0; transform: translateX(-40px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes tourIconPulse {
          0% { transform: scale(0.8); opacity: 0; }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
