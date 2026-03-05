"use client";

import { useState, useEffect } from "react";
import {
  Layout, FileCheck, BarChart3, Trophy, BookOpen,
  MessageSquare, Ticket, FileBarChart, Info, Rocket,
} from "lucide-react";
import { TOUR_STEPS_PROSPECT } from "./tour-steps";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Layout, FileCheck, BarChart3, Trophy, BookOpen,
  MessageSquare, Ticket, FileBarChart, Info, Rocket,
};

const KEYFRAMES_CSS = `
@keyframes tourSlideUp {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes tourBounceIn {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}
`;

interface Props {
  onComplete: () => void;
}

export function TourOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const steps = TOUR_STEPS_PROSPECT;
  const current = steps[step];
  const IconComponent = ICON_MAP[current.icon] || Info;

  // Inject keyframes into document head
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = KEYFRAMES_CSS;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else onComplete();
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "linear-gradient(145deg, #1E293B, #1A2332)",
          boxShadow: "0 0 40px rgba(45, 212, 191, 0.15)",
          animation: "tourSlideUp 0.3s ease-out",
        }}
      >
        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: i <= step ? "#2dd4bf" : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mx-auto"
          key={step}
          style={{
            background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.05))",
            animation: "tourBounceIn 0.5s ease-out",
          }}
        >
          <IconComponent className="w-8 h-8 text-teal-400" />
        </div>

        {/* Content */}
        <h3 className="text-xl font-bold text-white text-center mb-2">{current.title}</h3>
        <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">{current.content}</p>

        {/* Step counter */}
        <p className="text-xs text-zinc-500 text-center mb-4">{step + 1} de {steps.length}</p>

        {/* Navigation */}
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={prev}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              Atras
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: "linear-gradient(135deg, #2dd4bf, #14b8a6)", color: "#042F2E" }}
          >
            {step === steps.length - 1 ? "Comenzar" : "Siguiente"}
          </button>
        </div>

        {/* Skip */}
        <button
          onClick={onComplete}
          className="w-full mt-3 text-xs text-zinc-500 py-1 hover:text-zinc-400 transition-colors"
        >
          Saltar tour
        </button>
      </div>
    </div>
  );
}
