"use client";

import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveCheckpoint {
  id: string;
  name: string;
  orderIndex: number;
  isRequired: boolean;
  distanceM: number | null;
  geoRadiusM: number;
  qrRequired: boolean;
  isInRadius: boolean;
}

interface Props {
  checkpoint: ActiveCheckpoint | null;
  /** All checkpoints completed — show celebration card */
  allCompleted: boolean;
  completedCount: number;
  total: number;
  /** True while the mark request is in flight */
  isMarking: boolean;
  onConfirmMark: () => void;
  /** Transition direction: "in" for new card appearing, "out" for card leaving */
  transitionState: "idle" | "out" | "in";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function distanceColor(meters: number | null): { border: string; text: string } {
  if (meters == null) return { border: "#475569", text: "#64748b" };
  if (meters <= 10) return { border: "#22c55e", text: "#22c55e" };
  if (meters <= 50) return { border: "#14b8a6", text: "#14b8a6" };
  return { border: "#475569", text: "#64748b" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActiveCheckpointCard({
  checkpoint,
  allCompleted,
  completedCount,
  total,
  isMarking,
  onConfirmMark,
  transitionState,
}: Props) {
  // -- Success toast --
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (transitionState === "out") {
      setShowToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 2000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [transitionState]);

  const cardClass =
    transitionState === "out"
      ? "animate-slideDown opacity-0"
      : transitionState === "in"
        ? "animate-slideUp"
        : "";

  // -- All completed celebration --
  if (allCompleted) {
    return (
      <div className="mx-2 mb-2">
        <div className="rounded-2xl border border-green-700/40 bg-green-950/30 p-5 text-center">
          <div className="mb-1 text-2xl">🎉</div>
          <h3 className="text-base font-bold text-white">¡Ronda Completada!</h3>
          <p className="mt-1 text-xs text-gray-400">
            Todos los puntos marcados ({completedCount}/{total})
          </p>
        </div>
      </div>
    );
  }

  // -- No checkpoint to show --
  if (!checkpoint) return null;

  const canMark = checkpoint.isInRadius;
  const dc = distanceColor(checkpoint.distanceM);

  return (
    <>
      {/* Success toast */}
      {showToast && (
        <div className="fixed left-4 right-4 top-20 z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 shadow-lg shadow-green-900/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-white">Punto marcado exitosamente</span>
          </div>
        </div>
      )}

      {/* Active checkpoint card */}
      <div className={`mx-2 mb-2 ${cardClass}`}>
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "rgba(20,184,166,0.08)", borderColor: "rgba(20,184,166,0.2)" }}
        >
          {/* Row: number badge + name/badges + distance circle */}
          <div className="flex items-center gap-3">
            {/* Number badge — rounded square with gradient + breathe shadow */}
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                boxShadow: "0 4px 14px rgba(20,184,166,0.3)",
              }}
            >
              #{checkpoint.orderIndex + 1}
            </div>

            {/* Name + badges */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-white" style={{ fontSize: 15 }}>
                {checkpoint.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {checkpoint.isRequired && (
                  <span
                    className="rounded px-1.5 py-0.5 font-semibold text-status-warn-fg"
                    style={{ fontSize: 10, backgroundColor: "rgba(251,191,36,0.15)" }}
                  >
                    Obligatorio
                  </span>
                )}
                {checkpoint.distanceM != null && (
                  <span
                    className="rounded px-1.5 py-0.5 font-semibold text-slate-400"
                    style={{ fontSize: 10, backgroundColor: "rgba(255,255,255,0.05)" }}
                  >
                    {formatDistance(checkpoint.distanceM)}
                  </span>
                )}
                {checkpoint.qrRequired && (
                  <span
                    className="rounded px-1.5 py-0.5 font-semibold text-purple-400"
                    style={{ fontSize: 10, backgroundColor: "rgba(168,85,247,0.15)" }}
                  >
                    QR
                  </span>
                )}
              </div>
            </div>

            {/* Distance circle */}
            {checkpoint.distanceM != null && (
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ border: `3px solid ${dc.border}` }}
              >
                <span className="text-xs font-bold" style={{ color: dc.text }}>
                  {formatDistance(checkpoint.distanceM)}
                </span>
              </div>
            )}
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirmMark}
            disabled={!canMark || isMarking}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold transition-all ${
              isMarking
                ? "text-teal-200"
                : canMark
                  ? "text-white active:opacity-80"
                  : "text-slate-500"
            }`}
            style={
              isMarking
                ? { background: "rgba(20,184,166,0.3)" }
                : canMark
                  ? {
                      background: "linear-gradient(90deg, #14b8a6, #0d9488)",
                      boxShadow: "0 6px 20px rgba(20,184,166,0.35)",
                    }
                  : { background: "rgba(255,255,255,0.05)", opacity: 0.4 }
            }
          >
            {isMarking ? (
              <>
                <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Marcando...
              </>
            ) : canMark ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Confirmar Marcación
              </>
            ) : (
              <>Acércate al punto (radio: {checkpoint.geoRadiusM}m)</>
            )}
          </button>

          {/* Contextual hint */}
          {!canMark && !isMarking && (
            <p className="mt-1.5 text-center text-xs text-slate-500">
              Acércate al punto para poder marcar
            </p>
          )}
        </div>
      </div>
    </>
  );
}
