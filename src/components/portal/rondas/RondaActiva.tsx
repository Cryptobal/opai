"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { RondaProgress } from "./RondaProgress";
import { CheckpointMarker } from "./CheckpointMarker";
import { AutoMarkToast } from "./AutoMarkToast";
import { GpsStatusIndicator } from "./GpsStatusIndicator";
import { savePendingMark } from "@/lib/rondas-offline";
import type { RondasSession } from "./RondasPortalClient";
import type { MapCheckpoint } from "./RondaMap";

const RondaMap = dynamic(() => import("./RondaMap"), { ssr: false });

// ---------------------------------------------------------------------------
// Free-round auto-close thresholds
// ---------------------------------------------------------------------------
const FREE_ROUND_MAX_DURATION_MINUTES = 120;
const FREE_ROUND_WARNING_MINUTES = 15;
const FREE_ROUND_CRITICAL_MINUTES = 5;

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
  trustBreakdown?: Record<string, { score: number; weight: number }> | null;
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

  // -- Ad-hoc marked points (for map display) --
  const [adHocMarkedPoints, setAdHocMarkedPoints] = useState<
    { id: string; lat: number; lng: number; name: string }[]
  >([]);

  // -- Confirmation modal state --
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [incompleteNotes, setIncompleteNotes] = useState("");

  // -- Auto-complete celebration modal --
  const [showAutoCompleteModal, setShowAutoCompleteModal] = useState(false);
  const autoCompleteShownRef = useRef(false);

  // -- Geofence auto-prompt state --
  const [nearbyCheckpointId, setNearbyCheckpointId] = useState<string | null>(null);
  const dismissedGeofenceRef = useRef<Set<string>>(new Set());
  const lastVibratedRef = useRef<string | null>(null);
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenCooldownRef = useRef<Map<string, number>>(new Map());
  const stableGeofenceIdRef = useRef<string | null>(null);

  // -- GPS live tracking --
  const [guardPos, setGuardPos] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // -- GPS trail for ad-hoc map display --
  const [trailPoints, setTrailPoints] = useState<{ lat: number; lng: number }[]>([]);

  // -- Follow mode state --
  const [isFollowing, setIsFollowing] = useState(true);

  // -- Auto-mark state --
  const autoMarkingRef = useRef<Set<string>>(new Set());
  const autoMarkedRef = useRef<Set<string>>(new Set());
  const [autoMarkToast, setAutoMarkToast] = useState<{
    checkpointId: string;
    checkpointName: string;
  } | null>(null);

  // -- Live timer --
  const [now, setNow] = useState(() => Date.now());

  // Sync checkpoints when parent passes updated rondaData
  useEffect(() => {
    setCheckpoints(rondaData.checkpoints);
  }, [rondaData.checkpoints]);

  // GPS watchPosition + trail accumulation
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGuardPos(pt);
        setGpsAccuracy(pos.coords.accuracy ?? null);
        setTrailPoints((prev) => {
          // Only add if moved >3m from last point (avoid clutter)
          if (prev.length === 0) return [pt];
          const last = prev[prev.length - 1];
          const dx = (pt.lat - last.lat) * 111320;
          const dy = (pt.lng - last.lng) * 111320 * Math.cos(pt.lat * Math.PI / 180);
          if (Math.sqrt(dx * dx + dy * dy) < 3) return prev;
          return [...prev, pt];
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Ad-hoc flag (needed early for tracking effect)
  const isAdHoc = !rondaData.templateId;
  // Free-form (GPS-only) mode: ad-hoc AND no checkpoints from installation
  const isAdHocFreeForm = isAdHoc && checkpoints.length === 0;

  // -- Server-side GPS tracking (every 30s for ad-hoc rondas) --
  const trackingPointsRef = useRef<Array<{ lat: number; lng: number; ts: number }>>([]);

  useEffect(() => {
    if (!isAdHoc) return;

    const sendTracking = async () => {
      if (!guardPos) return;
      try {
        await fetch("/api/portal/rondas/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ejecucionId: rondaData.ejecucionId,
            guardiaId: session.guardiaId,
            lat: guardPos.lat,
            lng: guardPos.lng,
          }),
        });
        trackingPointsRef.current = [
          ...trackingPointsRef.current,
          { lat: guardPos.lat, lng: guardPos.lng, ts: Date.now() },
        ];
      } catch {
        // Silent fail — tracking is best-effort
      }
    };

    sendTracking();
    const id = setInterval(sendTracking, 30000);
    return () => clearInterval(id);
  }, [isAdHoc, guardPos?.lat, guardPos?.lng, rondaData.ejecucionId, session?.guardiaId]);

  // Timer interval
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Geofence auto-detection + auto-marking
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!guardPos || isAdHocFreeForm) return;

    // When marking is active, clear any pending auto-open timer
    if (markingCheckpointId) {
      if (autoOpenTimerRef.current) {
        clearTimeout(autoOpenTimerRef.current);
        autoOpenTimerRef.current = null;
      }
      stableGeofenceIdRef.current = null;
      return;
    }

    const unmarked = checkpoints.filter((c) => !c.completed);
    let closest: ApiCheckpoint | null = null;
    let closestDist = Infinity;

    for (const cp of unmarked) {
      const dist = haversineDistance(guardPos.lat, guardPos.lng, cp.lat, cp.lng);
      if (dist <= cp.geoRadiusM && dist < closestDist) {
        closest = cp;
        closestDist = dist;
      }
    }

    if (closest && !dismissedGeofenceRef.current.has(closest.id)) {
      const cooldownUntil = autoOpenCooldownRef.current.get(closest.id);
      const inCooldown = cooldownUntil != null && Date.now() < cooldownUntil;

      // Vibrate on first entry
      if (lastVibratedRef.current !== closest.id) {
        lastVibratedRef.current = closest.id;
        navigator.vibrate?.([100]);
      }

      // Determine if this checkpoint can be auto-marked
      const canAutoMark =
        !inCooldown &&
        !autoMarkingRef.current.has(closest.id) &&
        !autoMarkedRef.current.has(closest.id) &&
        (closest.verificationType === "GEOFENCE" || closest.verificationType === "BOTH") &&
        !(closest.tasks && closest.tasks.length > 0 && closest.tasks.some((t) => t.required)) &&
        !rondaData.qrRequerido &&
        closest.verificationType !== "QR";

      if (canAutoMark) {
        // AUTO-MARK: fire request directly without opening bottom sheet
        const cpToMark = closest;
        autoMarkingRef.current.add(cpToMark.id);
        setNearbyCheckpointId(null);

        (async () => {
          try {
            const body = {
              ejecucionId: rondaData.ejecucionId,
              checkpointId: cpToMark.id,
              lat: guardPos.lat,
              lng: guardPos.lng,
              gpsAccuracy: gpsAccuracy ?? undefined,
              batteryLevel: null as number | null,
              motionData: null,
              verificationMethod: "GEOFENCE",
              isOfflineSync: false,
              guardiaId: session.guardiaId,
            };

            // Try to read battery
            try {
              const batt = await (navigator as any).getBattery?.();
              if (batt) body.batteryLevel = Math.round(batt.level * 100);
            } catch { /* ignore */ }

            const res = await fetch("/api/portal/rondas/marcar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => null);
              // If already marked, treat as success
              if (errJson?.already_marked) {
                autoMarkedRef.current.add(cpToMark.id);
                setCheckpoints((prev) =>
                  prev.map((cp) => cp.id === cpToMark.id ? { ...cp, completed: true } : cp),
                );
                return;
              }
              throw new Error(errJson?.error || "Error");
            }

            const json = await res.json();
            if (json.success || json.already_marked) {
              autoMarkedRef.current.add(cpToMark.id);
              // Optimistic update
              setCheckpoints((prev) =>
                prev.map((cp) => cp.id === cpToMark.id ? { ...cp, completed: true } : cp),
              );
              // Show toast + vibrate
              navigator.vibrate?.([100]);
              setAutoMarkToast({ checkpointId: cpToMark.id, checkpointName: cpToMark.name });
              refreshCheckpoints();
            }
          } catch {
            // Network error — save offline
            try {
              await savePendingMark({
                ejecucionId: rondaData.ejecucionId,
                checkpointId: cpToMark.id,
                lat: guardPos.lat,
                lng: guardPos.lng,
                gpsAccuracy: gpsAccuracy ?? undefined,
                verificationMethod: "GEOFENCE",
                isOfflineSync: true,
                guardiaId: session.guardiaId,
                clientTimestamp: new Date().toISOString(),
              });
              autoMarkedRef.current.add(cpToMark.id);
              setCheckpoints((prev) =>
                prev.map((cp) => cp.id === cpToMark.id ? { ...cp, completed: true } : cp),
              );
              navigator.vibrate?.([100]);
              setAutoMarkToast({ checkpointId: cpToMark.id, checkpointName: cpToMark.name });
            } catch {
              // Failed offline too — fall back to manual
              setMarkingCheckpointId(cpToMark.id);
            }
          } finally {
            autoMarkingRef.current.delete(cpToMark.id);
          }
        })();
      } else if (!autoMarkedRef.current.has(closest.id)) {
        // Cannot auto-mark — show banner for manual marking
        setNearbyCheckpointId(closest.id);

        // Auto-open bottom sheet after 2s stability
        if (!inCooldown && stableGeofenceIdRef.current !== closest.id) {
          stableGeofenceIdRef.current = closest.id;
          if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current);
          const cpId = closest.id;
          autoOpenTimerRef.current = setTimeout(() => {
            autoOpenTimerRef.current = null;
            setNearbyCheckpointId(null);
            setMarkingCheckpointId(cpId);
          }, 2000);
        }
      }
    } else {
      // Left geofence
      stableGeofenceIdRef.current = null;
      if (autoOpenTimerRef.current) {
        clearTimeout(autoOpenTimerRef.current);
        autoOpenTimerRef.current = null;
      }
      setNearbyCheckpointId(null);
    }
  }, [guardPos, checkpoints, isAdHocFreeForm, markingCheckpointId, gpsAccuracy, rondaData.ejecucionId, rondaData.qrRequerido, session.guardiaId, refreshCheckpoints]);

  // Cleanup auto-open timer on unmount
  useEffect(() => {
    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current);
    };
  }, []);

  const nearbyCheckpoint = nearbyCheckpointId
    ? checkpoints.find((c) => c.id === nearbyCheckpointId) ?? null
    : null;

  // ---------------------------------------------------------------------------
  // Auto-complete detection: show celebration when all checkpoints marked
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAdHocFreeForm || autoCompleteShownRef.current) return;
    if (checkpoints.length === 0) return;
    const allDone = checkpoints.every((c) => c.completed);
    if (allDone) {
      autoCompleteShownRef.current = true;
      navigator.vibrate?.([200, 100, 200]);
      setShowAutoCompleteModal(true);
    }
  }, [checkpoints, isAdHocFreeForm]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const completedCount = isAdHocFreeForm
    ? adHocMarkedPoints.length
    : checkpoints.filter((c) => c.completed).length;
  const total = isAdHocFreeForm ? adHocMarkedPoints.length : checkpoints.length;

  const startTime = rondaData.startedAt
    ? new Date(rondaData.startedAt).getTime()
    : undefined;
  const elapsedSeconds = startTime
    ? Math.max(0, Math.floor((now - startTime) / 1000))
    : 0;

  const freeRoundTimeLeftMinutes = isAdHoc && startTime
    ? FREE_ROUND_MAX_DURATION_MINUTES - Math.floor((now - startTime) / 60000)
    : null;
  const showFreeRoundWarning = isAdHoc && freeRoundTimeLeftMinutes !== null && freeRoundTimeLeftMinutes <= FREE_ROUND_WARNING_MINUTES && freeRoundTimeLeftMinutes > FREE_ROUND_CRITICAL_MINUTES;
  const showFreeRoundCritical = isAdHoc && freeRoundTimeLeftMinutes !== null && freeRoundTimeLeftMinutes <= FREE_ROUND_CRITICAL_MINUTES;

  // Map checkpoints (include ad-hoc marked points for libre rondas)
  const mapCheckpoints = useMemo<MapCheckpoint[]>(() => {
    const templateCps = checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      lat: cp.lat,
      lng: cp.lng,
      orderIndex: cp.orderIndex,
      status: cp.completed
        ? ("completed" as const)
        : cp.id === closestPendingId
          ? ("active" as const)
          : ("pending" as const),
    }));

    if (!isAdHocFreeForm) return templateCps;

    // For ad-hoc rondas, add locally tracked marked points
    const adHocCps = adHocMarkedPoints.map((pt, i) => ({
      id: pt.id,
      name: pt.name,
      lat: pt.lat,
      lng: pt.lng,
      orderIndex: i,
      status: "completed" as const,
    }));

    return [...templateCps, ...adHocCps];
  }, [checkpoints, closestPendingId, isAdHocFreeForm, adHocMarkedPoints]);

  // Marking checkpoint info for bottom sheet
  const markingCheckpoint = markingCheckpointId
    ? checkpoints.find((c) => c.id === markingCheckpointId) ?? null
    : null;

  const isAdHocMark = markingCheckpointId === "ad-hoc-scan" || markingCheckpointId === "ad-hoc-gps";

  const markingCpInfo = useMemo(() => {
    if (!markingCheckpointId) return null;
    if (markingCheckpoint) {
      return {
        id: markingCheckpoint.id,
        name: markingCheckpoint.name,
        instrucciones: markingCheckpoint.instrucciones,
        lat: markingCheckpoint.lat,
        lng: markingCheckpoint.lng,
        geoRadiusM: markingCheckpoint.geoRadiusM,
        verificationType: markingCheckpoint.verificationType,
        tasks: markingCheckpoint.tasks,
      };
    }
    if (markingCheckpointId === "ad-hoc-gps") {
      return {
        id: "ad-hoc-gps" as const,
        name: "Punto GPS",
        instrucciones: null,
        lat: guardPos?.lat ?? 0,
        lng: guardPos?.lng ?? 0,
        geoRadiusM: 9999,
        verificationType: "GEOFENCE" as const,
        tasks: undefined,
      };
    }
    if (markingCheckpointId === "ad-hoc-scan") {
      return {
        id: "ad-hoc-scan" as const,
        name: "Checkpoint libre",
        instrucciones: null,
        lat: guardPos?.lat ?? 0,
        lng: guardPos?.lng ?? 0,
        geoRadiusM: 9999,
        verificationType: "QR" as const,
        tasks: undefined,
      };
    }
    return null;
  }, [markingCheckpointId, markingCheckpoint, guardPos]);

  const isInGeofenceOfMarking = useMemo(() => {
    if (!markingCpInfo || !guardPos) return false;
    const dist = haversineDistance(guardPos.lat, guardPos.lng, markingCpInfo.lat, markingCpInfo.lng);
    return dist <= markingCpInfo.geoRadiusM;
  }, [markingCpInfo, guardPos]);

  // Incomplete checkpoint names (for confirmation modal)
  const incompleteCheckpoints = checkpoints.filter((c) => !c.completed);

  // Sorted checkpoints: pending sorted by proximity, then completed
  const sortedCheckpoints = useMemo(() => {
    if (isAdHocFreeForm) return checkpoints;

    const pending: (ApiCheckpoint & { _dist: number })[] = [];
    const completed: ApiCheckpoint[] = [];

    for (const cp of checkpoints) {
      if (cp.completed) {
        completed.push(cp);
      } else {
        const dist = guardPos
          ? haversineDistance(guardPos.lat, guardPos.lng, cp.lat, cp.lng)
          : Infinity;
        pending.push({ ...cp, _dist: dist });
      }
    }

    // Sort pending by distance (closest first)
    pending.sort((a, b) => a._dist - b._dist);

    return [...pending, ...completed];
  }, [checkpoints, guardPos?.lat, guardPos?.lng, isAdHocFreeForm]);

  // The closest pending checkpoint is the new "active"
  const closestPendingId = sortedCheckpoints.find((cp) => !cp.completed)?.id ?? null;

  // Count of collapsed completed checkpoints
  const [showCompleted, setShowCompleted] = useState(false);

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
      // Build route snapshot for audit: checkpoint states at completion time
      const routeSnapshot = checkpoints.map((cp) => ({
        id: cp.id,
        name: cp.name,
        lat: cp.lat,
        lng: cp.lng,
        orderIndex: cp.orderIndex,
        status: cp.completed ? "completed" : "pending",
      }));

      const res = await fetch("/api/portal/rondas/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejecucionId: rondaData.ejecucionId,
          guardiaId: session.guardiaId,
          notes: incompleteNotes.trim() || null,
          walkRoute: trailPoints,
          routeSnapshot,
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
        trustBreakdown: json.data?.trustBreakdown ?? null,
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
  }, [rondaData.ejecucionId, session.guardiaId, onComplete, checkpoints, trailPoints, incompleteNotes]);

  const handleCompleteClick = useCallback(() => {
    if (!isAdHocFreeForm && incompleteCheckpoints.length > 0) {
      setShowConfirmModal(true);
    } else {
      handleComplete();
    }
  }, [isAdHocFreeForm, incompleteCheckpoints.length, handleComplete]);

  const confirmComplete = useCallback(() => {
    setShowConfirmModal(false);
    handleComplete();
  }, [handleComplete]);

  const cancelConfirmModal = useCallback(() => {
    setShowConfirmModal(false);
    setIncompleteNotes("");
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Main
  // ---------------------------------------------------------------------------
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div
      className="flex flex-1 min-h-0 flex-col overflow-x-hidden overflow-y-auto"
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
              {isAdHoc ? "Ronda Libre" : rondaData.templateName}
            </h1>
          </div>

          {/* Timer + Progress compact + GPS status */}
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <GpsStatusIndicator accuracy={gpsAccuracy} isWatching={guardPos !== null} />
            <span className="text-gray-400">
              {formatElapsed(elapsedSeconds)}
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

      {/* Auto-close warning banner for free rounds */}
      {showFreeRoundWarning && (
        <div className="mx-4 mt-2 rounded-lg border border-yellow-600/50 bg-yellow-950/40 px-4 py-2 text-center text-sm font-medium text-yellow-300">
          Tu ronda libre se cerrará automáticamente en {freeRoundTimeLeftMinutes} min
        </div>
      )}
      {showFreeRoundCritical && (
        <div className="mx-4 mt-2 animate-pulse rounded-lg border border-red-600/50 bg-red-950/40 px-4 py-2 text-center text-sm font-semibold text-red-300">
          Tu ronda se cerrará en {Math.max(0, freeRoundTimeLeftMinutes!)} min — finalízala ahora
        </div>
      )}

      {/* ============ Geofence Auto-Prompt Banner ============ */}
      {nearbyCheckpoint && !markingCheckpointId && (
        <div className="relative z-10 mx-4 mt-3 mb-1 rounded-xl border border-teal-500/60 bg-teal-950/80 p-3 shadow-lg shadow-teal-900/30 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500/20 ring-2 ring-teal-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-teal-200">
                Estas en {nearbyCheckpoint.name}
              </p>
              <p className="text-xs text-teal-400/70">
                {guardPos
                  ? formatDistance(
                      haversineDistance(guardPos.lat, guardPos.lng, nearbyCheckpoint.lat, nearbyCheckpoint.lng),
                    )
                  : ""}{" "}
                del punto
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => {
                  dismissedGeofenceRef.current.add(nearbyCheckpoint.id);
                  setNearbyCheckpointId(null);
                }}
                className="rounded-lg bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-400 transition-colors active:bg-gray-700"
              >
                Ignorar
              </button>
              <button
                onClick={() => {
                  setNearbyCheckpointId(null);
                  setMarkingCheckpointId(nearbyCheckpoint.id);
                }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-teal-700/40 transition-colors active:bg-teal-700"
              >
                Marcar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Leaflet Map ============ */}
      <div className="relative" style={{ isolation: "isolate" }}>
        <RondaMap
          checkpoints={mapCheckpoints}
          guardPosition={guardPos}
          height={isAdHocFreeForm ? "25vh" : mapCollapsed ? "20vh" : "45vh"}
          showRoute={true}
          interactive={true}
          showCenterButton={true}
          trailPoints={trailPoints}
          markingCheckpointId={markingCheckpointId}
          isFollowing={isFollowing}
          onManualInteraction={() => setIsFollowing(false)}
          onRecenter={() => setIsFollowing(true)}
          gpsAccuracy={gpsAccuracy}
        />

        {/* Map collapse toggle — hidden for ad-hoc rondas (fixed compact map) */}
        {!isAdHocFreeForm && (
          <button
            onClick={() => setMapCollapsed((v) => !v)}
            className="absolute bottom-0 left-1/2 z-10 flex min-h-[44px] -translate-x-1/2 translate-y-1/2 items-center gap-1 rounded-full border border-gray-700 bg-gray-900 px-4 py-2.5 text-xs text-gray-400 shadow-lg transition-colors hover:bg-gray-800 active:bg-gray-800"
            aria-label={mapCollapsed ? "Expandir mapa" : "Colapsar mapa"}
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
        )}
      </div>

      {/* ============ Checkpoint List (scrollable) ============ */}
      <main className="flex-1 space-y-2 overflow-y-auto px-4 pb-52 pt-6">
        {isAdHocFreeForm && (
          <div className="space-y-4">
            {/* GPS active indicator + timer + counter */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              {/* GPS tracking status */}
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">GPS activo — registrando recorrido</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-mono font-bold text-white">{formatElapsed(elapsedSeconds)}</p>
                  <p className="text-xs text-gray-500">Tiempo transcurrido</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-teal-400">{completedCount}</p>
                  <p className="text-xs text-gray-500">Puntos registrados</p>
                </div>
              </div>
            </div>

            {/* Action buttons: GPS + QR side by side */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMarkingCheckpointId("ad-hoc-gps")}
                className="flex flex-col items-center gap-2 rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-3 py-4 text-center transition-colors active:bg-emerald-900/40"
                style={{ minHeight: 80 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-emerald-400">Marcar GPS</p>
              </button>

              <button
                onClick={() => setMarkingCheckpointId("ad-hoc-scan")}
                className="flex flex-col items-center gap-2 rounded-xl border border-teal-700/50 bg-teal-950/30 px-3 py-4 text-center transition-colors active:bg-teal-900/40"
                style={{ minHeight: 80 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-teal-400">Marcar QR</p>
              </button>
            </div>

            {/* Mini-timeline of completed marcaciones */}
            {adHocMarkedPoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-sm text-gray-500">Sin puntos registrados aun</p>
                <p className="mt-1 text-xs text-gray-600">Usa los botones para registrar puntos</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Puntos registrados</p>
                {adHocMarkedPoints.map((pt, i) => (
                  <div key={pt.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold text-teal-400">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-300">{pt.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Non-ad-hoc checkpoint list — sorted by proximity */}
        {!isAdHocFreeForm && (() => {
          const pendingCps = sortedCheckpoints.filter((cp) => !cp.completed);
          const completedCps = sortedCheckpoints.filter((cp) => cp.completed);

          return (
            <>
              {pendingCps.map((cp, idx) => {
                const isClosest = cp.id === closestPendingId;
                const needsQr =
                  rondaData.qrRequerido &&
                  (cp.verificationType === "QR" || cp.verificationType === "BOTH");
                const cpDistance = guardPos
                  ? haversineDistance(guardPos.lat, guardPos.lng, cp.lat, cp.lng)
                  : null;

                if (isClosest) {
                  // -- Closest checkpoint: prominent card --
                  return (
                    <button
                      key={cp.id}
                      onClick={() => setMarkingCheckpointId(cp.id)}
                      className="w-full rounded-2xl border-2 border-teal-600/60 bg-teal-950/40 p-4 text-left transition-colors active:bg-teal-900/50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          <div className="relative flex h-8 w-8 items-center justify-center">
                            <span className="absolute h-8 w-8 animate-ping rounded-full opacity-30" style={{ backgroundColor: "#14b8a6" }} />
                            <div className="relative h-4 w-4 rounded-full" style={{ backgroundColor: "#14b8a6" }} />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-teal-300">{cp.name}</p>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            <span className="rounded-md bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-400">
                              Mas cercano
                            </span>
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
                              <span className="rounded-md bg-gray-700/60 px-2 py-0.5 text-xs font-semibold text-gray-200">
                                {formatDistance(cpDistance)}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-teal-400/70">Toca para marcar este punto</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="mt-1 h-5 w-5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  );
                }

                // -- Other pending checkpoints --
                return (
                  <button
                    key={cp.id}
                    onClick={() => setMarkingCheckpointId(cp.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-3 text-left transition-colors active:bg-gray-800"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(107,114,128,0.2)" }}>
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#6b7280" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-300">{cp.name}</p>
                      <div className="flex gap-2 text-xs text-gray-600">
                        {cp.isRequired && <span className="text-yellow-500/70">Obligatorio</span>}
                        {cpDistance != null && (
                          <span className={cpDistance <= cp.geoRadiusM ? "text-teal-500" : ""}>
                            {formatDistance(cpDistance)}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}

              {/* Completed checkpoints — collapsible */}
              {completedCps.length > 0 && (
                <>
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-xl bg-green-950/20 px-3 py-2 text-sm text-green-400/70 transition-colors active:bg-green-950/30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      Ver completados ({completedCps.length}/{total})
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`ml-auto h-4 w-4 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showCompleted && completedCps.map((cp) => (
                    <div key={cp.id} className="flex w-full items-center gap-3 rounded-2xl border border-green-900/30 bg-green-950/10 p-3 opacity-60">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.2)" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm text-gray-500">{cp.name}</p>
                    </div>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}
      </main>

      {/* ============ Bottom Sticky Buttons ============ */}
      {(() => {
        const requiredPending = checkpoints.filter((cp) => cp.isRequired && !cp.completed);
        const allRequiredDone = requiredPending.length === 0;
        const optionalPending = checkpoints.filter((cp) => !cp.isRequired && !cp.completed);

        return (
          <div
            className="fixed inset-x-0 bottom-16 z-20 border-t border-gray-800 px-4 pb-4 pt-3"
            style={{ backgroundColor: "#0a0a0f" }}
          >
            <button
              onClick={handleCompleteClick}
              disabled={completing || (!isAdHocFreeForm && !allRequiredDone)}
              className={`w-full rounded-xl py-3.5 text-base font-semibold transition-colors disabled:opacity-40 ${
                allRequiredDone || isAdHocFreeForm
                  ? "bg-teal-600 text-white hover:bg-teal-500 active:bg-teal-700"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
              style={{ minHeight: 52 }}
            >
              {completing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Completando...
                </span>
              ) : !isAdHocFreeForm && !allRequiredDone ? (
                <>Faltan {requiredPending.length} punto{requiredPending.length !== 1 ? "s" : ""} obligatorio{requiredPending.length !== 1 ? "s" : ""}</>
              ) : optionalPending.length > 0 ? (
                <>{"\u2713"} Completar Ronda ({optionalPending.length} opcionales sin marcar)</>
              ) : (
                <>{"\u2713"} Completar Ronda</>
              )}
            </button>
          </div>
        );
      })()}

      {/* ============ Confirmation Modal (incomplete checkpoints) ============ */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">
              Checkpoints pendientes
            </h2>
            <p className="mb-2 text-base text-gray-300">
              Te faltan{" "}
              <span className="font-semibold text-yellow-400">
                {incompleteCheckpoints.length}
              </span>{" "}
              puntos:
            </p>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto">
              {incompleteCheckpoints.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                  {c.name}
                  {c.isRequired && <span className="text-xs text-red-400">(obligatorio)</span>}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-sm text-gray-500">
              Indica por que no pudiste completar todos los puntos:
            </p>
            <textarea
              value={incompleteNotes}
              onChange={(e) => setIncompleteNotes(e.target.value)}
              placeholder="Ej: Acceso bloqueado, zona en mantenimiento..."
              maxLength={500}
              rows={3}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500 focus:outline-none"
            />
            <p className={`mb-3 mt-1 text-xs ${incompleteNotes.trim().length > 0 && incompleteNotes.trim().length < 10 ? "text-yellow-500/70" : "text-transparent"}`}>
              Minimo 10 caracteres
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelConfirmModal}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-base font-medium text-gray-300 transition-colors hover:bg-gray-700"
              >
                Seguir ronda
              </button>
              <button
                onClick={confirmComplete}
                disabled={incompleteNotes.trim().length < 10}
                className="flex-1 rounded-xl bg-yellow-600 py-3 text-base font-semibold text-white transition-colors hover:bg-yellow-500 disabled:opacity-40"
              >
                Completar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Auto-Complete Celebration Modal ============ */}
      {showAutoCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-green-700/50 bg-gray-900 p-6 text-center">
            <div className="mb-3 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-xl font-bold text-white">
              Ronda Completa!
            </h2>
            <p className="mb-1 text-base text-gray-300">
              Todos los checkpoints han sido marcados.
            </p>
            <p className="mb-5 text-sm text-gray-500">
              {completedCount}/{total} puntos &middot; {formatElapsed(elapsedSeconds)}
            </p>
            <button
              onClick={() => {
                setShowAutoCompleteModal(false);
                handleComplete();
              }}
              disabled={completing}
              className="w-full rounded-xl bg-green-600 py-3.5 text-base font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700 disabled:opacity-40"
            >
              {completing ? "Completando..." : "Finalizar Ronda"}
            </button>
            <button
              onClick={() => setShowAutoCompleteModal(false)}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700"
            >
              Seguir revisando
            </button>
          </div>
        </div>
      )}

      {/* ============ Auto-Mark Toast ============ */}
      {autoMarkToast && (
        <AutoMarkToast
          checkpointName={autoMarkToast.checkpointName}
          onAddPhoto={() => {
            setAutoMarkToast(null);
            // Open the checkpoint marker to add a photo
            setMarkingCheckpointId(autoMarkToast.checkpointId);
          }}
          onDismiss={() => setAutoMarkToast(null)}
        />
      )}

      {/* ============ CheckpointMarker Overlay ============ */}
      {markingCheckpointId && markingCpInfo && (
        <CheckpointMarker
          checkpoint={markingCpInfo}
          ejecucionId={rondaData.ejecucionId}
          guardiaId={session.guardiaId}
          qrRequerido={markingCheckpoint ? rondaData.qrRequerido : markingCheckpointId === "ad-hoc-scan"}
          guardPos={guardPos}
          isInGeofence={isInGeofenceOfMarking}
          onComplete={() => {
            const cpId = markingCheckpointId;
            const isAdHocMark = cpId === "ad-hoc-gps" || cpId === "ad-hoc-scan";

            if (isAdHocMark && guardPos) {
              const label = cpId === "ad-hoc-gps" ? "Punto GPS" : "Punto QR";
              setAdHocMarkedPoints((prev) => [
                ...prev,
                {
                  id: `adhoc-${Date.now()}`,
                  lat: guardPos.lat,
                  lng: guardPos.lng,
                  name: `${label} #${prev.length + 1}`,
                },
              ]);
            }

            // Optimistic local update: mark checkpoint as completed immediately
            if (cpId && !isAdHocMark) {
              setCheckpoints((prev) =>
                prev.map((cp) =>
                  cp.id === cpId ? { ...cp, completed: true } : cp,
                ),
              );
            }

            setMarkingCheckpointId(null);
            refreshCheckpoints();
          }}
          onBack={() => {
            if (markingCheckpointId && !markingCheckpointId.startsWith("ad-hoc")) {
              autoOpenCooldownRef.current.set(markingCheckpointId, Date.now() + 60000);
            }
            setMarkingCheckpointId(null);
          }}
        />
      )}
    </div>
  );
}
