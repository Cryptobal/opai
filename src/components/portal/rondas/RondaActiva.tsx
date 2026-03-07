"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { RondaProgress } from "./RondaProgress";
import { CheckpointMarker } from "./CheckpointMarker";
import type { RondasSession } from "./RondasPortalClient";
import type { MapCheckpoint } from "./RondaMap";

const RondaMap = dynamic(() => import("./RondaMap"), { ssr: false });

// ---------------------------------------------------------------------------
// Types — matches API shape from /api/portal/rondas/mis-rondas
// ---------------------------------------------------------------------------

export interface ApiCheckpointTask {
  id: string;
  label: string;
  type: "boolean" | "checklist" | "select" | "text" | "number" | "photo";
  required: boolean;
  options?: string[] | null;
  config?: {
    min?: number;
    max?: number;
    minPhotos?: number;
    placeholder?: string;
    alertOnValue?: string | boolean | number;
  } | null;
  sortOrder: number;
}

export interface ApiCheckpoint {
  id: string;
  name: string;
  instrucciones?: string | null;
  qrCode: string | null;
  lat: number;
  lng: number;
  geoRadiusM: number;
  verificationType: string;
  orderIndex: number;
  isRequired: boolean;
  completed: boolean;
  tasks?: ApiCheckpointTask[];
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
  checkpoints?: {
    name: string;
    status: "COMPLETED" | "MISSED";
    timestamp?: string;
    distanceM?: number;
    geoValidada?: boolean;
    qrScanned?: boolean;
    hasPhoto?: boolean;
  }[];
  scheduledAt?: string;
  startedAt?: string;
}

interface Props {
  session: RondasSession;
  rondaData: RondaData;
  onComplete: (data: CompletionData) => void;
  onBack: () => void;
  onReportIncident: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RondaActiva({
  session,
  rondaData,
  onComplete,
  onBack,
  onReportIncident,
}: Props) {
  const [checkpoints, setCheckpoints] = useState<ApiCheckpoint[]>(
    rondaData.checkpoints,
  );
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const completingRef = useRef(false);

  // -- CheckpointMarker bottom sheet state --
  const [markingCheckpointId, setMarkingCheckpointId] = useState<
    string | null
  >(null);

  // -- Map collapse state --
  const [mapCollapsed, setMapCollapsed] = useState(false);

  // -- Confirmation modal state --
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // -- GPS live tracking --
  const [guardPos, setGuardPos] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // -- Live timer --
  const [now, setNow] = useState(() => Date.now());

  // Sync checkpoints when parent passes updated rondaData
  useEffect(() => {
    setCheckpoints(rondaData.checkpoints);
  }, [rondaData.checkpoints]);

  // GPS watchPosition
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        setGuardPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Timer interval
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const completedCount = checkpoints.filter((c) => c.completed).length;
  const total = checkpoints.length;

  const activeCheckpointId =
    checkpoints.find((c) => !c.completed)?.id ?? null;

  const startTime = rondaData.startedAt
    ? new Date(rondaData.startedAt).getTime()
    : undefined;
  const elapsedSeconds = startTime
    ? Math.max(0, Math.floor((now - startTime) / 1000))
    : 0;

  // Map checkpoints
  const mapCheckpoints = useMemo<MapCheckpoint[]>(
    () =>
      checkpoints.map((cp) => ({
        id: cp.id,
        name: cp.name,
        lat: cp.lat,
        lng: cp.lng,
        orderIndex: cp.orderIndex,
        status: cp.completed
          ? "completed"
          : cp.id === activeCheckpointId
            ? "active"
            : "pending",
      })),
    [checkpoints, activeCheckpointId],
  );

  // Distance to active checkpoint
  const activeCheckpoint = checkpoints.find(
    (c) => c.id === activeCheckpointId,
  );
  const distanceToActive =
    guardPos && activeCheckpoint
      ? haversineDistance(
          guardPos.lat,
          guardPos.lng,
          activeCheckpoint.lat,
          activeCheckpoint.lng,
        )
      : null;

  // Marking checkpoint info for bottom sheet
  const markingCheckpoint = markingCheckpointId
    ? checkpoints.find((c) => c.id === markingCheckpointId) ?? null
    : null;

  // Incomplete checkpoint names (for confirmation modal)
  const incompleteCheckpoints = checkpoints.filter((c) => !c.completed);

  // Sorted checkpoints: active first, then pending, then completed
  const sortedCheckpoints = useMemo(() => {
    const active: ApiCheckpoint[] = [];
    const pending: ApiCheckpoint[] = [];
    const completed: ApiCheckpoint[] = [];
    for (const cp of checkpoints) {
      if (cp.completed) completed.push(cp);
      else if (cp.id === activeCheckpointId) active.push(cp);
      else pending.push(cp);
    }
    return [...active, ...pending, ...completed];
  }, [checkpoints, activeCheckpointId]);

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  const refreshCheckpoints = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        guardiaId: session.guardiaId,
        installationId: session.installationId,
        tenantId: session.tenantId,
      });
      const res = await fetch(
        `/api/portal/rondas/mis-rondas?${params.toString()}`,
      );
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
      // Silently fail
    }
  }, [session, rondaData.ejecucionId]);

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
        throw new Error(
          errJson?.error || `Error del servidor (${res.status})`,
        );
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
        checkpoints: json.data?.checkpoints,
        scheduledAt: json.data?.scheduledAt,
        startedAt: json.data?.startedAt,
      });
    } catch (err: unknown) {
      completingRef.current = false;
      setError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      setCompleting(false);
    }
  }, [rondaData.ejecucionId, session.guardiaId, onComplete]);

  const handleCompleteClick = useCallback(() => {
    if (incompleteCheckpoints.length > 0) {
      setShowConfirmModal(true);
    } else {
      handleComplete();
    }
  }, [incompleteCheckpoints.length, handleComplete]);

  const confirmComplete = useCallback(() => {
    setShowConfirmModal(false);
    handleComplete();
  }, [handleComplete]);

  // ---------------------------------------------------------------------------
  // Render: CheckpointMarker bottom sheet overlay
  // ---------------------------------------------------------------------------
  if (markingCheckpointId && markingCheckpoint) {
    return (
      <CheckpointMarker
        checkpoint={{
          id: markingCheckpoint.id,
          name: markingCheckpoint.name,
          instrucciones: markingCheckpoint.instrucciones,
          lat: markingCheckpoint.lat,
          lng: markingCheckpoint.lng,
          geoRadiusM: markingCheckpoint.geoRadiusM,
          verificationType: markingCheckpoint.verificationType,
          tasks: markingCheckpoint.tasks,
        }}
        ejecucionId={rondaData.ejecucionId}
        guardiaId={session.guardiaId}
        qrRequerido={rondaData.qrRequerido}
        onComplete={() => {
          setMarkingCheckpointId(null);
          refreshCheckpoints();
        }}
        onBack={() => setMarkingCheckpointId(null)}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main
  // ---------------------------------------------------------------------------
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      {/* ============ Header ============ */}
      <header
        className="sticky top-0 z-10 border-b border-gray-800 px-4 py-3"
        style={{ backgroundColor: "#0a0a0f" }}
      >
        <div className="flex items-center gap-3">
          {/* Back button */}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Volver
          </button>

          {/* Ronda name */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-white">
              {rondaData.templateName}
            </h1>
          </div>

          {/* Timer + Progress compact */}
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="text-gray-400">
              {"\u23F1\uFE0F"} {formatElapsed(elapsedSeconds)}
            </span>
            <span className="text-gray-600">&middot;</span>
            <span
              className={
                pct >= 100 ? "font-medium text-green-400" : "text-teal-400"
              }
            >
              {completedCount}/{total}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 100 ? "#22c55e" : "#14b8a6",
            }}
          />
        </div>
      </header>

      {/* ============ Leaflet Map ============ */}
      <div className="relative" style={{ isolation: "isolate" }}>
        <RondaMap
          checkpoints={mapCheckpoints}
          guardPosition={guardPos}
          height={mapCollapsed ? "20vh" : "45vh"}
          showRoute={true}
          interactive={true}
          showCenterButton={true}
        />

        {/* Map collapse toggle */}
        <button
          onClick={() => setMapCollapsed((v) => !v)}
          className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 translate-y-1/2 items-center gap-1 rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-400 shadow-lg transition-colors hover:bg-gray-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 transition-transform ${mapCollapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 15l7-7 7 7"
            />
          </svg>
          {mapCollapsed ? "Expandir" : "Colapsar"}
        </button>
      </div>

      {/* ============ Checkpoint List (scrollable) ============ */}
      <main className="flex-1 space-y-2 overflow-y-auto px-4 pb-52 pt-6">
        {sortedCheckpoints.map((cp) => {
          const isCompleted = cp.completed;
          const isActive = cp.id === activeCheckpointId;
          const needsQr =
            rondaData.qrRequerido &&
            (cp.verificationType === "QR" ||
              cp.verificationType === "BOTH");

          // Distance for active checkpoint
          const cpDistance =
            isActive && guardPos
              ? haversineDistance(
                  guardPos.lat,
                  guardPos.lng,
                  cp.lat,
                  cp.lng,
                )
              : null;

          if (isActive) {
            // -- Active checkpoint: prominent card --
            return (
              <button
                key={cp.id}
                onClick={() => setMarkingCheckpointId(cp.id)}
                className="w-full rounded-2xl border-2 border-teal-600/60 bg-teal-950/40 p-4 text-left transition-colors active:bg-teal-900/50"
              >
                <div className="flex items-start gap-3">
                  {/* Pulsing active dot */}
                  <div className="mt-1 shrink-0">
                    <div className="relative flex h-8 w-8 items-center justify-center">
                      <span
                        className="absolute h-8 w-8 animate-ping rounded-full opacity-30"
                        style={{ backgroundColor: "#14b8a6" }}
                      />
                      <div
                        className="relative h-4 w-4 rounded-full"
                        style={{ backgroundColor: "#14b8a6" }}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-teal-300">
                      {cp.name}
                    </p>

                    {/* Badges */}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {cp.isRequired && (
                        <span className="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">
                          Obligatorio
                        </span>
                      )}
                      {needsQr && (
                        <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400">
                          QR requerido
                        </span>
                      )}
                      {cpDistance != null && (
                        <span className="rounded-md bg-gray-700/60 px-2 py-0.5 text-xs text-gray-300">
                          {"\uD83D\uDCCF"} {formatDistance(cpDistance)}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-teal-400/70">
                      Toca para marcar este punto
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mt-1 h-5 w-5 shrink-0 text-teal-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            );
          }

          if (isCompleted) {
            // -- Completed checkpoint: dimmed with green check --
            return (
              <div
                key={cp.id}
                className="flex w-full items-center gap-3 rounded-2xl border border-green-900/30 bg-green-950/10 p-3 opacity-60"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(34,197,94,0.2)" }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-gray-500">
                  {cp.name}
                </p>
              </div>
            );
          }

          // -- Pending checkpoint: compact row --
          return (
            <button
              key={cp.id}
              onClick={() => setMarkingCheckpointId(cp.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-3 text-left transition-colors active:bg-gray-800"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(107,114,128,0.2)" }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: "#6b7280" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-300">{cp.name}</p>
                {cp.isRequired && (
                  <p className="text-xs text-gray-600">Obligatorio</p>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          );
        })}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}
      </main>

      {/* ============ Bottom Sticky Buttons ============ */}
      <div
        className="fixed inset-x-0 bottom-16 z-20 border-t border-gray-800 px-4 pb-4 pt-3"
        style={{ backgroundColor: "#0a0a0f" }}
      >
        <div className="flex gap-3">
          {/* Report Incident */}
          <button
            onClick={onReportIncident}
            className="flex-1 rounded-xl border border-red-800/50 bg-red-950/30 py-3.5 text-base font-medium text-red-400 transition-colors hover:bg-red-950/50 active:bg-red-900/40"
            style={{ minHeight: 52 }}
          >
            {"\uD83D\uDEA8"} Reportar Incidente
          </button>

          {/* Complete Ronda */}
          <button
            onClick={handleCompleteClick}
            disabled={completing}
            className="flex-1 rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-40"
            style={{ minHeight: 52 }}
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
              <>{"\u2713"} Completar Ronda</>
            )}
          </button>
        </div>
      </div>

      {/* ============ Confirmation Modal ============ */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">
              Checkpoints pendientes
            </h2>
            <p className="mb-4 text-base text-gray-300">
              Te faltan{" "}
              <span className="font-semibold text-yellow-400">
                {incompleteCheckpoints.length}
              </span>{" "}
              puntos:{" "}
              <span className="text-gray-400">
                {incompleteCheckpoints.map((c) => c.name).join(", ")}
              </span>
              . {"\u00BF"}Completar de todas formas?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-base font-medium text-gray-300 transition-colors hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmComplete}
                className="flex-1 rounded-xl bg-teal-600 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-500"
              >
                Completar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
