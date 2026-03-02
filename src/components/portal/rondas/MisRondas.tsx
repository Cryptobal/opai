"use client";

import { useState, useEffect, useCallback } from "react";
import type { RondasSession } from "./RondasPortalClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointItem {
  id: string;
  nombre: string;
  orden: number;
  completado: boolean;
}

interface RondaItem {
  ejecucionId: string;
  templateId: string;
  templateName: string;
  status: string; // "pendiente" | "en_curso" | "completada" | "incompleta" | "atrasada"
  scheduledAt: string; // ISO date
  startedAt: string | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  qrRequerido: boolean;
  orderMode: string; // "flexible" | "secuencial"
  estimatedDurationMin: number | null;
  checkpoints: CheckpointItem[];
}

interface Props {
  session: RondasSession;
  onLogout: () => void;
  onIniciarRonda: (ejecucionId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completada":
      return "Completada";
    case "en_curso":
      return "En Curso";
    case "pendiente":
      return "Pendiente";
    case "atrasada":
      return "Atrasada";
    case "incompleta":
      return "Incompleta";
    default:
      return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completada":
      return "bg-green-500/20 text-green-400";
    case "en_curso":
      return "bg-teal-500/20 text-teal-400";
    case "pendiente":
      return "bg-gray-500/20 text-gray-400";
    case "atrasada":
      return "bg-red-500/20 text-red-400";
    case "incompleta":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MisRondas({ session, onLogout, onIniciarRonda }: Props) {
  const [rondas, setRondas] = useState<RondaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // ---- Online/offline listeners ----
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ---- Fetch rondas ----
  const fetchRondas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        guardiaId: session.guardiaId,
        installationId: session.installationId,
        tenantId: session.tenantId,
      });
      const res = await fetch(`/api/portal/rondas/mis-rondas?${params.toString()}`);
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403
          ? "Sesión expirada. Vuelva a ingresar."
          : `Error del servidor (${res.status})`);
        setRondas([]);
        return;
      }
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Error al cargar rondas");
        setRondas([]);
        return;
      }

      setRondas(json.data ?? []);
    } catch {
      setError("Error de conexión. Revise su señal.");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId, session.installationId, session.tenantId]);

  useEffect(() => {
    fetchRondas();
  }, [fetchRondas]);

  // ---- Render ----
  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "#0a0a0f" }}>
      {/* ============ Header ============ */}
      <header className="sticky top-0 z-10 border-b border-gray-800 px-4 py-3" style={{ backgroundColor: "#0a0a0f" }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-white">{session.nombre}</h1>
            <p className="truncate text-sm text-gray-400">{session.installationName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Online/Offline indicator */}
            <span className="flex items-center gap-1.5 text-sm">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isOnline ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className={isOnline ? "text-green-400" : "text-red-400"}>
                {isOnline ? "En línea" : "Sin conexión"}
              </span>
            </span>
            {/* Logout */}
            <button
              onClick={onLogout}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-700 active:bg-gray-600"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ============ Content ============ */}
      <main className="flex-1 px-4 pb-8 pt-4">
        {/* Title row + refresh */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Mis Rondas</h2>
          <button
            onClick={fetchRondas}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50"
          >
            {/* Refresh icon (inline SVG) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Actualizar
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && rondas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              className="h-10 w-10 animate-spin text-teal-500"
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
            <p className="mt-4 text-lg text-gray-400">Cargando rondas...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && rondas.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="mt-4 text-lg text-gray-400">No hay rondas programadas para hoy</p>
          </div>
        )}

        {/* Ronda cards */}
        {rondas.length > 0 && (
          <div className="space-y-4">
            {rondas.map((ronda) => (
              <RondaCard key={ronda.ejecucionId} ronda={ronda} onIniciar={onIniciarRonda} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ronda Card sub-component
// ---------------------------------------------------------------------------

function RondaCard({
  ronda,
  onIniciar,
}: {
  ronda: RondaItem;
  onIniciar: (ejecucionId: string) => void;
}) {
  const isCompleted = ronda.status === "completada";
  const isEnCurso = ronda.status === "en_curso";
  const isPendiente = ronda.status === "pendiente";
  const isAtrasada = ronda.status === "atrasada";

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        isCompleted
          ? "border-green-900/50 bg-green-950/20"
          : "border-gray-800 bg-gray-900/60"
      }`}
    >
      {/* Top row: name + status badge */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3
          className={`text-lg font-semibold ${
            isCompleted ? "text-gray-500" : "text-white"
          }`}
        >
          {ronda.templateName}
        </h3>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusColor(ronda.status)}`}
        >
          {statusLabel(ronda.status)}
        </span>
      </div>

      {/* Info row */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
        {/* Scheduled time */}
        <span className={isCompleted ? "text-gray-600" : "text-gray-300"}>
          {formatTime(ronda.scheduledAt)}
        </span>

        {/* Checkpoints progress */}
        <span className={isCompleted ? "text-gray-600" : "text-gray-400"}>
          {ronda.checkpointsCompletados}/{ronda.checkpointsTotal} checkpoints
        </span>

        {/* Estimated duration */}
        {ronda.estimatedDurationMin != null && ronda.estimatedDurationMin > 0 && (
          <span className={isCompleted ? "text-gray-600" : "text-gray-500"}>
            ~{ronda.estimatedDurationMin} min
          </span>
        )}
      </div>

      {/* Completed: checkmark row */}
      {isCompleted && (
        <div className="flex items-center gap-2 text-green-500">
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
          <span className="text-sm">
            Completada — programada {formatTime(ronda.scheduledAt)}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {isPendiente && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-2 w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700"
          style={{ minHeight: 56 }}
        >
          Iniciar Ronda
        </button>
      )}

      {isAtrasada && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-2 w-full rounded-xl bg-red-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-red-500 active:bg-red-700"
          style={{ minHeight: 56 }}
        >
          Iniciar Ronda (Atrasada)
        </button>
      )}

      {isEnCurso && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-2 w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700"
          style={{ minHeight: 56 }}
        >
          Continuar Ronda
        </button>
      )}
    </div>
  );
}
