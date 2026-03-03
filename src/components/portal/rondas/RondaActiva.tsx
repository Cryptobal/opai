"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { RondaProgress } from "./RondaProgress";
import type { RondasSession } from "./RondasPortalClient";

// ---------------------------------------------------------------------------
// Types — matches API shape from /api/portal/rondas/mis-rondas
// ---------------------------------------------------------------------------

export interface ApiCheckpoint {
  id: string;
  name: string;
  qrCode: string | null;
  lat: number;
  lng: number;
  geoRadiusM: number;
  verificationType: string;
  orderIndex: number;
  isRequired: boolean;
  completed: boolean;
}

export interface RondaData {
  ejecucionId: string;
  templateId: string;
  templateName: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  qrRequerido: boolean;
  orderMode: string;
  estimatedDurationMin: number | null;
  checkpoints: ApiCheckpoint[];
}

export interface CompletionData {
  trustScore: number;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
}

interface Props {
  session: RondasSession;
  rondaData: RondaData;
  onMark: (checkpointId: string) => void;
  onComplete: (data: CompletionData) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RondaActiva({ session, rondaData, onMark, onComplete, onBack }: Props) {
  const [checkpoints, setCheckpoints] = useState<ApiCheckpoint[]>(rondaData.checkpoints);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const completingRef = useRef(false);

  // C2 fix: Sync checkpoints when parent passes updated rondaData
  useEffect(() => {
    setCheckpoints(rondaData.checkpoints);
  }, [rondaData.checkpoints]);

  const completedCount = checkpoints.filter((c) => c.completed).length;
  const total = checkpoints.length;

  // Find the first incomplete checkpoint (for "active" highlight)
  const activeCheckpointId = checkpoints.find((c) => !c.completed)?.id ?? null;

  // Refresh checkpoint statuses from API
  const refreshCheckpoints = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        guardiaId: session.guardiaId,
        installationId: session.installationId,
        tenantId: session.tenantId,
      });
      const res = await fetch(`/api/portal/rondas/mis-rondas?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      const updated = (json.data as RondaData[]).find(
        (r) => r.ejecucionId === rondaData.ejecucionId,
      );
      if (updated) {
        setCheckpoints(updated.checkpoints);
      }
    } catch {
      // Silently fail — user can still continue
    }
  }, [session, rondaData.ejecucionId]);

  // Expose refresh for parent to call after marking
  // The parent will re-render this component, but we also provide a manual refresh
  // by calling it when screen comes back from marcar
  // (Handled via the onMark flow in the parent)

  const handleComplete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/rondas/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejecucionId: rondaData.ejecucionId,
          guardiaId: session.guardiaId,
          notes: null,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Error del servidor (${res.status})`);
      }
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Error al completar ronda");
      }
      navigator.vibrate?.(200);
      onComplete({
        trustScore: json.data?.trustScore ?? 0,
        porcentajeCompletado: json.data?.porcentajeCompletado ?? 0,
        durationMinutes: json.data?.durationMinutes ?? null,
        missed: json.data?.missed ?? 0,
      });
    } catch (err: unknown) {
      completingRef.current = false;
      setError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      setCompleting(false);
    }
  }, [rondaData.ejecucionId, session.guardiaId, onComplete]);

  // Trigger refresh when component mounts or re-renders after coming back from marcar
  // We use a simple approach: parent passes updated rondaData when needed

  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "#0a0a0f" }}>
      {/* ============ Header ============ */}
      <header
        className="sticky top-0 z-10 border-b border-gray-800 px-4 py-3"
        style={{ backgroundColor: "#0a0a0f" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-base text-gray-300 transition-colors hover:bg-gray-700 active:bg-gray-600"
            style={{ minHeight: 44 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-white">
              {rondaData.templateName}
            </h1>
          </div>
          {/* Refresh button */}
          <button
            onClick={refreshCheckpoints}
            className="rounded-lg bg-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-700 active:bg-gray-600"
            title="Actualizar estado"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* ============ Content ============ */}
      <main className="flex-1 space-y-5 px-4 pb-8 pt-5">
        {/* ---- Progress ---- */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <RondaProgress completed={completedCount} total={total} />
        </div>

        {/* ---- Checkpoint List ---- */}
        <div className="space-y-2">
          {checkpoints.map((cp) => {
            const isCompleted = cp.completed;
            const isActive = cp.id === activeCheckpointId;

            return (
              <button
                key={cp.id}
                onClick={() => {
                  if (!isCompleted) onMark(cp.id);
                }}
                disabled={isCompleted}
                aria-label={`${cp.name} - ${isCompleted ? "Completado" : isActive ? "Siguiente" : "Pendiente"}${cp.isRequired && !isCompleted ? ", obligatorio" : ""}`}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  isCompleted
                    ? "border-green-900/40 bg-green-950/20 opacity-70"
                    : isActive
                      ? "border-teal-700/60 bg-teal-950/30"
                      : "border-gray-800 bg-gray-900/60 active:bg-gray-800"
                }`}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {isCompleted ? (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(34,197,94,0.2)" }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(20,184,166,0.2)" }}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: "#14b8a6" }}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(107,114,128,0.2)" }}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: "#6b7280" }}
                      />
                    </div>
                  )}
                </div>

                {/* Checkpoint info */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-base font-medium ${
                      isCompleted
                        ? "text-gray-500"
                        : isActive
                          ? "text-teal-300"
                          : "text-gray-300"
                    }`}
                  >
                    {cp.name}
                  </p>
                  {cp.isRequired && !isCompleted && (
                    <p className="text-xs text-gray-500">Obligatorio</p>
                  )}
                </div>

                {/* Arrow for actionable items */}
                {!isCompleted && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 shrink-0 text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* ---- Error ---- */}
        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}

        {/* ---- Complete Button ---- */}
        <button
          onClick={handleComplete}
          disabled={completing}
          className="w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-40"
          style={{ minHeight: 56 }}
        >
          {completing ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
              Completando...
            </span>
          ) : (
            "Completar Ronda"
          )}
        </button>
      </main>
    </div>
  );
}
