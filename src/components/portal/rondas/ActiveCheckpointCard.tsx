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

  // Show toast on transition out (checkpoint just marked)
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

  // Transition classes
  const cardClass =
    transitionState === "out"
      ? "animate-slideDown opacity-0"
      : transitionState === "in"
        ? "animate-slideUp"
        : "";

  // -- All completed celebration --
  if (allCompleted) {
    return (
      <div className="mx-4 mt-4">
        <div className="rounded-2xl border border-green-700/40 bg-green-950/30 p-6 text-center">
          <div className="mb-2 text-3xl">🎉</div>
          <h3 className="text-lg font-bold text-white">¡Ronda Completada!</h3>
          <p className="mt-1 text-sm text-gray-400">
            Todos los puntos marcados ({completedCount}/{total})
          </p>
        </div>
      </div>
    );
  }

  // -- No checkpoint to show --
  if (!checkpoint) return null;

  const canMark = checkpoint.isInRadius;

  return (
    <>
      {/* Success toast */}
      {showToast && (
        <div className="fixed left-4 right-4 top-20 z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 shadow-lg shadow-green-900/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-white">
              Punto marcado exitosamente
            </span>
          </div>
        </div>
      )}

      {/* Active checkpoint card */}
      <div className={`mx-4 mt-4 ${cardClass}`}>
        <div className="rounded-2xl border-2 border-teal-600/60 bg-teal-950/40 p-4">
          {/* Header: number + name + badges */}
          <div className="flex items-start gap-3">
            {/* Checkpoint number badge */}
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: "#14b8a6" }}
            >
              {checkpoint.orderIndex + 1}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-white">
                {checkpoint.name}
              </p>

              {/* Badges row */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {checkpoint.isRequired && (
                  <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                    Obligatorio
                  </span>
                )}
                {checkpoint.distanceM != null && (
                  <span className="flex items-center gap-1 rounded-md bg-gray-700/60 px-2 py-0.5 text-xs font-semibold text-gray-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {formatDistance(checkpoint.distanceM)}
                  </span>
                )}
                {checkpoint.qrRequired && (
                  <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400">
                    QR requerido
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirmMark}
            disabled={!canMark || isMarking}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold transition-all ${
              isMarking
                ? "bg-teal-700/60 text-teal-200"
                : canMark
                  ? "bg-teal-600 text-white shadow-lg shadow-teal-700/40 active:bg-teal-700"
                  : "bg-gray-700/50 text-gray-400"
            }`}
            style={{ minHeight: 52 }}
          >
            {isMarking ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Marcando...
              </>
            ) : canMark ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
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
            <p className="mt-2 text-center text-xs text-gray-500">
              Acércate al punto para poder marcar
            </p>
          )}
        </div>
      </div>
    </>
  );
}
