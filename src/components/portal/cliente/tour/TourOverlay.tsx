"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  FileText,
  Compass,
  MessageCircle,
} from "lucide-react";
import { buildTourSteps } from "./tour-steps";
import type { ClienteSession } from "@/lib/portal-cliente-types";

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
  onComplete: (navigateTo?: string) => void;
  session?: ClienteSession | null;
}

export function TourOverlay({ onComplete, session }: Props) {
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [displayStep, setDisplayStep] = useState(0);
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const [showPostTour, setShowPostTour] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = useMemo(
    () =>
      buildTourSteps({
        contactName: session?.firstName || undefined,
        accountName: session?.accountName || undefined,
        ejecutivoName: session?.ejecutivoName,
      }),
    [session?.firstName, session?.accountName, session?.ejecutivoName],
  );

  const current = steps[displayStep];
  const Icon = ICON_MAP[current.icon] || Shield;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  const goTo = useCallback(
    (target: number) => {
      if (transitioning || target === step || target < 0 || target >= steps.length) return;
      setSlideDir(target > step ? "next" : "prev");
      setTransitioning(true);
      clearTimeout(timeoutRef.current ?? undefined);
      timeoutRef.current = setTimeout(() => {
        setDisplayStep(target);
        setStep(target);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setTransitioning(false));
        });
      }, 200);
    },
    [step, transitioning, steps.length],
  );

  const next = useCallback(() => {
    if (isLast) {
      setShowPostTour(true);
    } else {
      goTo(step + 1);
    }
  }, [isLast, goTo, step]);

  const prev = useCallback(() => {
    if (!isFirst) goTo(step - 1);
  }, [isFirst, goTo, step]);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current ?? undefined);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (showPostTour) return;
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onComplete();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onComplete, showPostTour]);

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

  const contentOffset =
    transitioning
      ? slideDir === "next"
        ? "translate3d(-30px, 0, 0)"
        : "translate3d(30px, 0, 0)"
      : "translate3d(0, 0, 0)";

  /* ── Post-tour action modal ── */
  if (showPostTour) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
      >
        <div
          className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden p-6"
          style={{
            background: "linear-gradient(165deg, #1a2332 0%, #0f172a 100%)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.5)",
            animation: "tourCardEnter 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {session?.accountLogoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={session.accountLogoUrl}
                alt=""
                className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 object-contain"
              />
            </div>
          )}
          <h3
            className="text-xl font-bold text-white text-center mb-2"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            {session?.firstName ? `¿Qué te gustaría hacer, ${session.firstName}?` : "¿Qué te gustaría hacer?"}
          </h3>
          <p className="text-sm text-zinc-400 text-center mb-6">
            Elige cómo quieres comenzar
          </p>

          <div className="space-y-3">
            <button
              onClick={() => onComplete("propuesta")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))",
                border: "1px solid rgba(45,212,191,0.25)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(45,212,191,0.15)" }}
              >
                <FileText className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Ver mi propuesta</p>
                <p className="text-xs text-zinc-400">Revisa los detalles de tu cotización</p>
              </div>
            </button>

            <button
              onClick={() => onComplete("dashboard")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.03))",
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(139,92,246,0.12)" }}
              >
                <Compass className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Explorar el portal</p>
                <p className="text-xs text-zinc-400">Descubre las métricas y funcionalidades</p>
              </div>
            </button>

            <button
              onClick={() => onComplete("chat")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(56,189,248,0.1), rgba(56,189,248,0.03))",
                border: "1px solid rgba(56,189,248,0.2)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(56,189,248,0.12)" }}
              >
                <MessageCircle className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Hablar con {session?.ejecutivoName || "mi ejecutivo"}</p>
                <p className="text-xs text-zinc-400">Consultas directas por chat</p>
              </div>
            </button>
          </div>
        </div>

        <style>{`
          @keyframes tourCardEnter {
            from { opacity: 0; transform: translateY(40px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    );
  }

  /* ── Tour slides ── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(165deg, #1a2332 0%, #0f172a 100%)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(45,212,191,0.08)",
          animation: "tourCardEnter 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5 pb-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="group relative p-1"
              aria-label={`Paso ${i + 1}`}
            >
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: i === step ? 24 : 8,
                  backgroundColor:
                    i === step
                      ? "#2dd4bf"
                      : i < step
                        ? "rgba(45,212,191,0.4)"
                        : "rgba(255,255,255,0.1)",
                  transition: "width 0.4s ease, background-color 0.4s ease",
                }}
              />
            </button>
          ))}
        </div>

        {/* Animated content area */}
        <div
          className="min-h-[300px] flex flex-col justify-center"
          style={{
            opacity: transitioning ? 0 : 1,
            transform: contentOffset,
            transition: "opacity 0.2s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Logo or Icon */}
          <div className="px-8 pt-2 pb-2">
            {step === 0 && session?.accountLogoUrl ? (
              <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center bg-white/5 border border-white/10">
                <img
                  src={session.accountLogoUrl}
                  alt=""
                  className="max-h-14 max-w-14 object-contain"
                />
              </div>
            ) : (
              <div
                className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br ${current.accent} flex items-center justify-center`}
                style={{ border: "1px solid rgba(45,212,191,0.15)" }}
              >
                <Icon className="w-10 h-10 text-teal-400" />
              </div>
            )}
          </div>

          {/* Text */}
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
        </div>

        {/* Step counter */}
        <div className="text-center pt-1 pb-1">
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
              {isLast ? "Comenzar" : "Siguiente"}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </span>
          </button>
        </div>

        {/* Skip */}
        <div className="text-center pb-5">
          <button
            onClick={() => onComplete()}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors py-1 px-4"
          >
            Saltar tour
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tourCardEnter {
          from { opacity: 0; transform: translateY(40px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
