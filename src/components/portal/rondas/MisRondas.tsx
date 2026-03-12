"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { RondasSession } from "./RondasPortalClient";
import type { MapCheckpoint } from "./RondaMap";
import { HistorialRondaModal } from "./HistorialRondaModal";

// Lazy-load RondaMap to avoid SSR issues with Leaflet
const RondaMap = dynamic(() => import("./RondaMap"), {
  ssr: false,
  loading: () => <div className="h-[120px] animate-pulse rounded-lg bg-zinc-900" />,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointItem {
  id: string;
  name: string;
  qrCode: string | null;
  lat: number | null;
  lng: number | null;
  geoRadiusM: number | null;
  verificationType: string;
  orderIndex: number;
  isRequired: boolean;
  completed: boolean;
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
  toleranciaMinutos: number;
  trustScore?: number;
  porcentajeCompletado?: number;
  checkpoints: CheckpointItem[];
}

interface Props {
  session: RondasSession;
  onIniciarRonda: (ejecucionId: string) => void;
  onIniciarRondaLibre: () => void;
  onShowTour?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSession(s: { guardiaId: string; installationId: string; tenantId: string }): boolean {
  return (
    typeof s.guardiaId === "string" && UUID_RE.test(s.guardiaId) &&
    typeof s.installationId === "string" && UUID_RE.test(s.installationId) &&
    typeof s.tenantId === "string" && s.tenantId.length > 0
  );
}

async function fetchWithRetry(url: string, retries = 2, delay = 500): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return res;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error("fetch failed");
}

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

/** Returns "Xh Ym" from a duration in ms */
function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Returns "MM:SS" from a duration in ms */
function formatMMSS(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Check if ronda has checkpoints with valid coordinates */
function hasValidCoords(checkpoints: CheckpointItem[]): boolean {
  return checkpoints.some((cp) => cp.lat != null && cp.lng != null);
}

const CHILE_TZ = "America/Santiago";

/** True if scheduledAt falls on the current calendar day in Chile */
function isScheduledTodayChile(scheduledAtIso: string): boolean {
  try {
    const scheduled = new Date(scheduledAtIso);
    const now = new Date();
    const scheduledDay = scheduled.toLocaleDateString("en-CA", { timeZone: CHILE_TZ });
    const todayDay = now.toLocaleDateString("en-CA", { timeZone: CHILE_TZ });
    return scheduledDay === todayDay;
  } catch {
    return false;
  }
}

/** Map CheckpointItem[] to MapCheckpoint[] (only those with valid coords) */
function toMapCheckpoints(checkpoints: CheckpointItem[], rondaStatus: string): MapCheckpoint[] {
  return checkpoints
    .filter((cp) => cp.lat != null && cp.lng != null)
    .map((cp) => ({
      id: cp.id,
      name: cp.name,
      lat: cp.lat!,
      lng: cp.lng!,
      status: cp.completed
        ? "completed" as const
        : rondaStatus === "en_curso" && !cp.completed
          ? "pending" as const
          : "pending" as const,
      orderIndex: cp.orderIndex,
    }));
}

// ---------------------------------------------------------------------------
// Historial types
// ---------------------------------------------------------------------------

interface HistorialItem {
  ejecucionId: string;
  templateName: string;
  installationName: string;
  completedAt: string;
  durationMinutes: number | null;
  porcentajeCompletado: number;
  trustScore: number;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  status: string;
  isAdHoc: boolean;
}

// ---------------------------------------------------------------------------
// Section types — Redesigned priority order
// ---------------------------------------------------------------------------

type SectionKey = "en_curso" | "listas" | "con_retraso" | "proximas" | "no_realizadas" | "completadas";

interface SectionDef {
  key: SectionKey;
  label: string;
  collapsible: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: "en_curso", label: "RONDA ACTIVA", collapsible: false },
  { key: "listas", label: "LISTAS PARA INICIAR", collapsible: false },
  { key: "con_retraso", label: "CON RETRASO", collapsible: false },
  { key: "proximas", label: "PR\u00D3XIMAS", collapsible: false },
  { key: "no_realizadas", label: "NO REALIZADAS HOY", collapsible: true },
  { key: "completadas", label: "COMPLETADAS HOY", collapsible: true },
];

/** Classify a pending ronda based on elapsed time vs tolerancia */
function classifyPendiente(
  scheduledMs: number,
  toleranciaMin: number,
  nowMs: number,
): "proximas" | "listas" | "con_retraso" | "no_realizadas" {
  const elapsed = nowMs - scheduledMs;
  const toleranciaMs = toleranciaMin * 60000;
  const halfTol = toleranciaMs / 2;

  if (elapsed < -15 * 60000) return "proximas"; // More than 15 min before scheduled
  if (elapsed < 0) return "listas"; // 0-15 min before scheduled
  if (elapsed <= halfTol) return "listas"; // 0 to half-tolerance: "A tiempo"
  if (elapsed <= toleranciaMs) return "con_retraso"; // half-tolerance to tolerance: "Con retraso"
  return "no_realizadas"; // Past tolerance: no start allowed
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MisRondas({ session, onIniciarRonda, onIniciarRondaLibre, onShowTour }: Props) {
  const [rondas, setRondas] = useState<RondaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [now, setNow] = useState(() => Date.now());
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    no_realizadas: true,
    completadas: true,
  });
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [selectedRondaId, setSelectedRondaId] = useState<string | null>(null);

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ---- Live clock (1s) for countdowns/timers ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    if (!isValidSession(session)) {
      setError("Sesi\u00F3n inv\u00E1lida. Vuelva a ingresar.");
      setRondas([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        guardiaId: session.guardiaId,
        installationId: session.installationId,
        tenantId: session.tenantId,
      });
      const res = await fetchWithRetry(`/api/portal/rondas/mis-rondas?${params.toString()}`);
      if (!res.ok) {
        setError(
          res.status === 401 || res.status === 403
            ? "Sesi\u00F3n expirada. Vuelva a ingresar."
            : `Error del servidor (${res.status})`,
        );
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
      setError("Error de conexi\u00F3n. Revise su se\u00F1al.");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId, session.installationId, session.tenantId]);

  useEffect(() => {
    fetchRondas();
  }, [fetchRondas]);

  // ---- Fetch historial (last 30 days) ----
  useEffect(() => {
    if (!isValidSession(session)) return;
    let cancelled = false;
    setHistorialLoading(true);
    fetch(
      `/api/portal/rondas/historial?guardiaId=${session.guardiaId}&tenantId=${session.tenantId}&limit=30`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) {
          setHistorial(json.data ?? []);
        }
      })
      .catch(() => {/* silent: historial is non-critical */})
      .finally(() => {
        if (!cancelled) setHistorialLoading(false);
      });
    return () => { cancelled = true; };
  }, [session.guardiaId, session.tenantId]);

  // ---- Group rondas into sections (redesigned priority) ----
  // "NO REALIZADAS HOY" y "COMPLETADAS HOY" solo muestran rondas del día actual (Chile)
  const grouped = useMemo(() => {
    const map: Record<SectionKey, RondaItem[]> = {
      en_curso: [],
      listas: [],
      con_retraso: [],
      proximas: [],
      no_realizadas: [],
      completadas: [],
    };

    for (const r of rondas) {
      if (r.status === "en_curso") {
        map.en_curso.push(r);
      } else if (r.status === "no_realizada" || r.status === "cerrada_auto" || r.status === "cerrada_admin") {
        if (isScheduledTodayChile(r.scheduledAt)) {
          map.no_realizadas.push(r);
        }
      } else if (r.status === "pendiente") {
        const scheduledMs = new Date(r.scheduledAt).getTime();
        const toleranciaMin = r.toleranciaMinutos ?? 30;
        const key = classifyPendiente(scheduledMs, toleranciaMin, now);
        map[key].push(r);
      } else if (r.status === "completada" || r.status === "incompleta") {
        if (isScheduledTodayChile(r.scheduledAt)) {
          map.completadas.push(r);
        }
      }
    }

    return map;
  }, [rondas, now]);

  // ---- Block free round when scheduled rounds are pending ("listas" / "con_retraso") ----
  const pendingScheduledCount = grouped.listas.length + grouped.con_retraso.length;
  const hasPendingScheduled = pendingScheduledCount > 0;

  // ---- Date header ----
  const dateHeader = useMemo(() => {
    const d = new Date();
    const formatted = d.toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    // Capitalize first letter
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, []);

  // ---- Render ----
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto" style={{ backgroundColor: "#0a0a0f" }}>
      {/* ============ Content ============ */}
      <main className="flex-1 px-4 pt-3" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
        {/* Status bar */}
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isOnline ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className={isOnline ? "text-green-400" : "text-red-400"}>
              {isOnline ? "En l\u00EDnea" : "Sin conexi\u00F3n"}
            </span>
          </span>
        </div>

        {/* Title row + refresh */}
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Mis Rondas</h2>
          <div className="flex items-center gap-2">
            {onShowTour && (
              <button
                onClick={onShowTour}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors active:bg-gray-700"
                aria-label="Ayuda"
                title="Ver tour de ayuda"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={fetchRondas}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50"
            >
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
        </div>

        {/* Date header */}
        <p className="mb-4 text-sm text-gray-500">{dateHeader}</p>

        {/* Ad-hoc ronda button */}
        <button
          onClick={onIniciarRondaLibre}
          disabled={hasPendingScheduled}
          className={`mb-2 flex w-full items-center justify-center gap-2 rounded-xl border py-4 text-lg font-semibold transition-colors ${
            hasPendingScheduled
              ? "border-gray-700/30 bg-gray-900/20 text-gray-600 cursor-not-allowed opacity-50"
              : "border-teal-700/50 bg-teal-950/30 text-teal-400 hover:bg-teal-900/40 active:bg-teal-900/60"
          }`}
          style={{ minHeight: 56 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Iniciar Ronda Libre
        </button>
        {hasPendingScheduled && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>
              Tienes {pendingScheduledCount} ronda{pendingScheduledCount !== 1 ? "s" : ""} programada{pendingScheduledCount !== 1 ? "s" : ""} pendiente{pendingScheduledCount !== 1 ? "s" : ""}. Completa tus rondas programadas primero.
            </span>
          </div>
        )}
        {!hasPendingScheduled && <div className="mb-2" />}

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

        {/* Grouped sections */}
        {rondas.length > 0 && (
          <div className="space-y-6">
            {SECTIONS.map((section) => {
              const items = grouped[section.key];
              if (items.length === 0) return null;

              const isCollapsible = section.collapsible;
              const isCollapsed = isCollapsible && collapsedSections[section.key];

              const labelColor =
                section.key === "en_curso"
                  ? "text-teal-400"
                  : section.key === "listas"
                    ? "text-green-400"
                    : section.key === "con_retraso"
                      ? "text-orange-400"
                      : section.key === "no_realizadas"
                        ? "text-red-400"
                        : section.key === "completadas"
                          ? "text-green-400"
                          : "text-gray-400";

              return (
                <div key={section.key}>
                  {/* Section header */}
                  <button
                    type="button"
                    onClick={isCollapsible ? () => toggleSection(section.key) : undefined}
                    className={`mb-3 flex w-full items-center gap-2 text-left text-sm font-bold uppercase tracking-wider ${
                      isCollapsible ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span className={labelColor}>
                      {section.label}
                    </span>
                    {isCollapsible && (
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          section.key === "no_realizadas"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {items.length}
                      </span>
                    )}
                    {isCollapsible && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`ml-auto h-4 w-4 text-gray-500 transition-transform ${
                          !isCollapsed ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>

                  {/* Cards */}
                  {!isCollapsed && (
                    <div className="space-y-3">
                      {items.map((ronda) => (
                        <RondaCard
                          key={ronda.ejecucionId}
                          ronda={ronda}
                          sectionKey={section.key}
                          now={now}
                          onIniciar={onIniciarRonda}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============ Historial section ============ */}
        <div className="mt-6">
          {/* Section separator */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
              Mis rondas realizadas
            </span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          {historialLoading && (
            <div className="flex items-center justify-center py-8">
              <svg
                className="h-6 w-6 animate-spin text-teal-500"
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
            </div>
          )}

          {!historialLoading && historial.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-600">
              Sin rondas registradas en los últimos 30 días
            </p>
          )}

          {!historialLoading && historial.length > 0 && (
            <div className="space-y-2">
              {historial.map((item) => (
                <HistorialCard
                  key={item.ejecucionId}
                  item={item}
                  onTap={() => setSelectedRondaId(item.ejecucionId)}
                />
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Detail modal */}
      {selectedRondaId && (
        <HistorialRondaModal
          ejecucionId={selectedRondaId}
          session={session}
          onClose={() => setSelectedRondaId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historial Card sub-component
// ---------------------------------------------------------------------------

function HistorialCard({
  item,
  onTap,
}: {
  item: HistorialItem;
  onTap: () => void;
}) {
  const d = new Date(item.completedAt);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("es-CL", { month: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dateStr = `${day} ${month} · ${hh}:${mm}`;

  const statusBg =
    item.status === "completada"
      ? "bg-green-500/20 text-green-400"
      : item.status === "incompleta"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-gray-700/50 text-gray-400";
  const statusLabel =
    item.status === "completada"
      ? "Completada"
      : item.status === "incompleta"
        ? "Incompleta"
        : item.status === "cerrada_auto"
          ? "Cerrada auto"
          : item.status;

  const scoreColor =
    item.trustScore >= 80
      ? "text-green-400"
      : item.trustScore >= 50
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-left transition-colors hover:border-gray-700 hover:bg-gray-900/80 active:bg-gray-800/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-200">
            {item.templateName}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{dateStr}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBg}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
        <span>
          {item.checkpointsCompletados}/{item.checkpointsTotal} CP ·{" "}
          {Math.round(item.porcentajeCompletado)}%
        </span>
        <span className={`font-medium ${scoreColor}`}>
          Score: {item.trustScore}
        </span>
        {item.durationMinutes != null && (
          <span>
            {item.durationMinutes >= 60
              ? `${Math.floor(item.durationMinutes / 60)}h ${item.durationMinutes % 60}m`
              : `${item.durationMinutes}m`}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ronda Card sub-component
// ---------------------------------------------------------------------------

function RondaCard({
  ronda,
  sectionKey,
  now,
  onIniciar,
}: {
  ronda: RondaItem;
  sectionKey: SectionKey;
  now: number;
  onIniciar: (ejecucionId: string) => void;
}) {
  const isEnCurso = sectionKey === "en_curso";
  const isLista = sectionKey === "listas";
  const isConRetraso = sectionKey === "con_retraso";
  const isProxima = sectionKey === "proximas";
  const isNoRealizada = sectionKey === "no_realizadas";
  const isCompletada = sectionKey === "completadas";

  const scheduledMs = new Date(ronda.scheduledAt).getTime();
  const startedMs = ronda.startedAt ? new Date(ronda.startedAt).getTime() : null;

  // Time info
  let timeInfo = "";
  if (isEnCurso && startedMs) {
    const elapsed = now - startedMs;
    timeInfo = `${formatMMSS(elapsed)} transcurridos`;
  } else if (isConRetraso) {
    const elapsed = now - scheduledMs;
    timeInfo = `Con retraso: ${formatDuration(elapsed)}`;
  } else if (isNoRealizada) {
    timeInfo = `Programada: ${formatTime(ronda.scheduledAt)} - No realizada`;
  } else if (isProxima) {
    const remaining = scheduledMs - now;
    timeInfo = `Faltan ${formatDuration(remaining)}`;
  } else if (isCompletada && ronda.startedAt) {
    timeInfo = `Completada a las ${formatTime(ronda.startedAt)}`;
  }

  // Progress for en_curso
  const progress =
    ronda.checkpointsTotal > 0
      ? (ronda.checkpointsCompletados / ronda.checkpointsTotal) * 100
      : 0;

  // Mini-map checkpoints
  const showMap = hasValidCoords(ronda.checkpoints) && !isNoRealizada;
  const mapCheckpoints = useMemo(
    () => (showMap ? toMapCheckpoints(ronda.checkpoints, ronda.status) : []),
    [ronda.checkpoints, ronda.status, showMap],
  );

  // Card border styling
  const borderClass = isEnCurso
    ? "border-teal-700/60 bg-teal-950/20"
    : isConRetraso
      ? "border-orange-700/50 bg-orange-950/20"
      : isNoRealizada
        ? "border-red-800/30 bg-red-950/10"
        : isCompletada
          ? "border-gray-800/50 bg-gray-900/30"
          : "border-gray-800 bg-gray-900/60";

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${borderClass}`}>
      {/* Top row: name + scheduled time */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3
          className={`text-lg font-semibold ${
            isCompletada || isNoRealizada ? "text-gray-500" : "text-white"
          }`}
        >
          {ronda.templateName}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {isConRetraso && (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
              Retraso
            </span>
          )}
          {isNoRealizada && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
              No realizada
            </span>
          )}
          {ronda.status === "cerrada_auto" && (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
              Cerrada auto
            </span>
          )}
          {ronda.status === "cerrada_admin" && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
              Cerrada admin
            </span>
          )}
          <span className={`text-sm ${isCompletada || isNoRealizada ? "text-gray-600" : "text-gray-400"}`}>
            {formatTime(ronda.scheduledAt)}
          </span>
        </div>
      </div>

      {/* Time info */}
      {timeInfo && (
        <p
          className={`mb-2 text-sm font-medium ${
            isEnCurso
              ? "text-teal-400"
              : isConRetraso
                ? "text-orange-400"
                : isNoRealizada
                  ? "text-red-400"
                  : isProxima
                    ? "text-gray-400"
                    : "text-gray-500"
          }`}
        >
          {timeInfo}
        </p>
      )}

      {/* Progress bar for en_curso */}
      {isEnCurso && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
            <span>
              {ronda.checkpointsCompletados}/{ronda.checkpointsTotal} checkpoints
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Checkpoint info for actionable cards */}
      {!isEnCurso && !isCompletada && !isNoRealizada && (
        <p className="mb-2 text-sm text-gray-500">
          {ronda.checkpointsTotal} checkpoints
          {ronda.estimatedDurationMin ? ` \u00B7 ~${ronda.estimatedDurationMin} min` : ""}
        </p>
      )}

      {/* Completada: score */}
      {isCompletada && (
        <div className="mb-2 flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            {ronda.checkpointsCompletados}/{ronda.checkpointsTotal} checkpoints
          </span>
          {ronda.porcentajeCompletado != null && (
            <span className="text-gray-500">
              {Math.round(ronda.porcentajeCompletado)}%
            </span>
          )}
          {ronda.trustScore != null && (
            <span
              className={`font-medium ${
                ronda.trustScore >= 80
                  ? "text-green-400"
                  : ronda.trustScore >= 50
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              Score: {ronda.trustScore}
            </span>
          )}
          {ronda.status === "incompleta" && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
              Incompleta
            </span>
          )}
        </div>
      )}

      {/* Mini-map */}
      {showMap && (
        <div className="mb-3 overflow-hidden rounded-lg">
          <RondaMap
            checkpoints={mapCheckpoints}
            height="120px"
            interactive={false}
            showRoute={true}
          />
        </div>
      )}

      {/* Action buttons */}
      {isEnCurso && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-1 w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700"
          style={{ minHeight: 56 }}
        >
          Continuar Ronda
        </button>
      )}

      {isLista && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-1 w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700"
          style={{ minHeight: 56 }}
        >
          Iniciar Ronda
        </button>
      )}

      {isConRetraso && (
        <button
          onClick={() => onIniciar(ronda.ejecucionId)}
          className="mt-1 w-full rounded-xl bg-orange-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-orange-500 active:bg-orange-700"
          style={{ minHeight: 56 }}
        >
          Iniciar Ronda (Con Retraso)
        </button>
      )}

      {/* no_realizadas and proximas: NO start button */}
    </div>
  );
}
