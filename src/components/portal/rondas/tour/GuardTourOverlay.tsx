"use client";

import { useState } from "react";
import {
  Shield,
  ClipboardList,
  Map,
  Radar,
  Route,
  Trophy,
  FileWarning,
  AlertTriangle,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { GUARD_TOUR_STEPS } from "./guard-tour-steps";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Icon map — matches the `icon` string in each tour step
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  ClipboardList,
  Map,
  Radar,
  Route,
  Trophy,
  FileWarning,
  AlertTriangle,
  MessageCircle,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  onComplete: () => void;
}

export function GuardTourOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const steps = GUARD_TOUR_STEPS;
  const current = steps[step];
  const IconComponent = ICON_MAP[current.icon] ?? Shield;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-[#0a0a0f]/95 backdrop-blur-sm px-6">
      {/* Close button */}
      <button
        onClick={onComplete}
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 active:bg-zinc-800"
        aria-label="Cerrar tour"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Card content */}
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="mb-8 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-teal-400"
                  : i < step
                    ? "w-1.5 bg-teal-700"
                    : "w-1.5 bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${current.bgColor}`}
        >
          <IconComponent className="h-10 w-10 text-status-info-fg" />
        </div>

        {/* Title */}
        <h2 className="mb-3 text-center text-xl font-bold text-white">
          {current.title}
        </h2>

        {/* Description */}
        <p className="mb-8 text-center text-base leading-relaxed text-gray-400">
          {current.description}
        </p>

        {/* Step counter */}
        <p className="mb-4 text-center text-xs text-zinc-600">
          {step + 1} de {steps.length}
        </p>

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-700 py-3.5 text-base font-medium text-gray-400 transition-colors active:bg-zinc-800"
              style={{ minHeight: 48 }}
            >
              <ChevronLeft className="h-4 w-4" />
              Atras
            </button>
          )}
          <button
            onClick={() => (isLast ? onComplete() : setStep(step + 1))}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-status-info py-3.5 text-base font-semibold text-white transition-colors active:bg-teal-700"
            style={{ minHeight: 48 }}
          >
            {isLast ? "Comenzar" : "Siguiente"}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Skip link */}
        <button
          onClick={onComplete}
          className="mt-4 w-full py-2 text-center text-sm text-zinc-600 active:text-zinc-400"
        >
          Saltar tour
        </button>
      </div>
    </div>
  );
}
