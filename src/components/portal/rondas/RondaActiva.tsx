"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { CheckpointMarker } from "./CheckpointMarker";
import { AutoMarkToast } from "./AutoMarkToast";
import { GpsStatusIndicator } from "./GpsStatusIndicator";
import { ProgressRing } from "./ProgressRing";
import { ActiveCheckpointCard } from "./ActiveCheckpointCard";
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
  /** Marca quedó registrada pero fuera del radio de la geocerca (señal pobre). */
  geoNoVerificada?: boolean;
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
  frecuenciaMinutos: number | null;
  /** ISO string of the next scheduled round for the same programacion */
  nextRoundAt: string | null;
  checkpoints: ApiCheckpoint[];
}

export interface CompletionData {
  trustScore: number;
  /** false = ronda libre; no mostrar Trust como métrica de cumplimiento */
  trustApplicable?: boolean;
  trustBreakdown?: Record<string, { score: number; weight: number }> | null;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
  notes?: string | null;
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

  // -- Manual override: guard tapped a checkpoint on the map --
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const selectedOverrideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Card transition state --
  const [cardTransition, setCardTransition] = useState<"idle" | "out" | "in">("idle");

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
  /** Última lectura aceptada: accuracy + ts (filtro: no degradar salvo stale 15s). */
  const guardReadQualityRef = useRef<{ accuracy: number; ts: number } | null>(null);
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
    geoNoVerificada?: boolean;
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
        const rawAcc = pos.coords.accuracy;
        const newAcc =
          rawAcc != null && Number.isFinite(rawAcc) && rawAcc > 0 ? rawAcc : 999_999;
        const now = Date.now();
        const prevQ = guardReadQualityRef.current;
        const stale = prevQ != null && now - prevQ.ts > 15_000;
        const accept =
          prevQ == null || newAcc <= prevQ.accuracy || stale;
        if (!accept) return;

        guardReadQualityRef.current = { accuracy: newAcc, ts: now };
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGuardPos(pt);
        setGpsAccuracy(rawAcc ?? null);
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

  // Disable pull-to-refresh on html/body while ronda is active
  useEffect(() => {
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overscrollBehavior = "";
      document.documentElement.style.overscrollBehavior = "";
    };
  }, []);

  // Ad-hoc flag (needed early for tracking effect)
  const isAdHoc = !rondaData.templateId;
  // Free-form (GPS-only) mode: ad-hoc AND no checkpoints from installation
  const isAdHocFreeForm = isAdHoc && checkpoints.length === 0;

  // -- Server-side GPS tracking (every 30s mientras la ronda está en curso) --
  const trackingPointsRef = useRef<Array<{ lat: number; lng: number; ts: number }>>([]);

  useEffect(() => {
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
  }, [guardPos?.lat, guardPos?.lng, rondaData.ejecucionId, session?.guardiaId]);

  // -- Flush accumulated GPS trail to server every 60 s (survives auto-close) --
  useEffect(() => {
    const flushWalkRoute = async () => {
      if (trailPoints.length < 2) return;
      try {
        await fetch("/api/portal/rondas/walk-route-flush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ejecucionId: rondaData.ejecucionId,
            guardiaId: session.guardiaId,
            points: trailPoints,
          }),
        });
      } catch {
        // Silent fail — flush is best-effort
      }
    };

    const id = setInterval(flushWalkRoute, 60000);
    return () => clearInterval(id);
  }, [trailPoints, rondaData.ejecucionId, session.guardiaId]);

  // Timer interval
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Refresh checkpoints (moved before geofence effect that depends on it)
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
        !rondaData.qrRequerido;

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
              const geoNoVerificada = json.data?.geoNoVerificada === true;
              autoMarkedRef.current.add(cpToMark.id);
              // Optimistic update — NO marcar como `completed` si la geo no se verificó.
              setCheckpoints((prev) =>
                prev.map((cp) =>
                  cp.id === cpToMark.id
                    ? { ...cp, completed: !geoNoVerificada, geoNoVerificada }
                    : cp,
                ),
              );
              navigator.vibrate?.([100]);
              setAutoMarkToast({
                checkpointId: cpToMark.id,
                checkpointName: cpToMark.name,
                geoNoVerificada: geoNoVerificada || undefined,
              });
              refreshCheckpoints();
            }
          } catch (err) {
            // Solo TypeError = caída de red real (estándar fetch en todos los navegadores).
            // Cualquier otro error = el servidor respondió un error → NO guardar offline,
            // NO pintar verde. Abrir el marcado manual para que el guardia vea qué pasó.
            if (err instanceof TypeError) {
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
                // Falló también el guardado offline — abrir marcado manual
                setMarkingCheckpointId(cpToMark.id);
              }
            } else {
              // El servidor rechazó la marca. No es offline. Abrir marcado manual
              // para que el guardia tenga feedback real en vez de un ✓ falso.
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current);
      if (selectedOverrideTimerRef.current) clearTimeout(selectedOverrideTimerRef.current);
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

  // Warning for scheduled rounds: show when < 5 min until next round starts (auto-close point)
  const scheduledCloseAt = !isAdHoc && rondaData.nextRoundAt
    ? new Date(rondaData.nextRoundAt).getTime()
    : !isAdHoc && startTime && rondaData.frecuenciaMinutos
      ? startTime + rondaData.frecuenciaMinutos * 60 * 1000
      : null;
  const scheduledMinutesLeft = scheduledCloseAt !== null
    ? Math.floor((scheduledCloseAt - now) / 60000)
    : null;
  const showScheduledWarning = !isAdHoc && scheduledMinutesLeft !== null && scheduledMinutesLeft <= 5 && scheduledMinutesLeft > 0;
  const showScheduledCritical = !isAdHoc && scheduledMinutesLeft !== null && scheduledMinutesLeft <= 0;

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

  // Map checkpoints (include ad-hoc marked points for libre rondas)
  const mapCheckpoints = useMemo<MapCheckpoint[]>(() => {
    const templateCps = checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      lat: cp.lat,
      lng: cp.lng,
      orderIndex: cp.orderIndex,
      geoRadiusM: cp.geoRadiusM,
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

  // (sortedCheckpoints & closestPendingId moved above mapCheckpoints)

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

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
        trustApplicable: json.data?.trustApplicable !== false,
        trustBreakdown: json.data?.trustBreakdown ?? null,
        porcentajeCompletado: json.data?.porcentajeCompletado ?? 0,
        durationMinutes: json.data?.durationMinutes ?? null,
        missed: json.data?.missed ?? 0,
        notes: incompleteNotes.trim() || null,
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
  return (
    <div
      className="flex h-dvh flex-col overflow-hidden overscroll-none touch-manipulation"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      {/* ============ Header ============ */}
      <header
        className="shrink-0 z-10 border-b border-gray-800 px-4 py-3"
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

          {/* Timer + Progress ring + GPS status */}
          <div className="flex shrink-0 items-center gap-1.5 text-sm">
            <GpsStatusIndicator accuracy={gpsAccuracy} isWatching={guardPos !== null} />
            <span className="text-gray-400 tabular-nums">
              {formatElapsed(elapsedSeconds)}
            </span>
            {/* Obligatorios pending pill — compact */}
            {(() => {
              const reqPending = checkpoints.filter((cp) => cp.isRequired && !cp.completed);
              if (reqPending.length === 0) return null;
              return (
                <span
                  className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
                  title={`${reqPending.length} obligatorio${reqPending.length !== 1 ? "s" : ""} pendiente${reqPending.length !== 1 ? "s" : ""}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  {reqPending.length}
                </span>
              );
            })()}
            <ProgressRing completed={completedCount} total={total} size={36} />
          </div>
        </div>
      </header>

      {/* Auto-close warning banner for free rounds */}
      {showFreeRoundWarning && (
        <div className="mx-4 mt-2 rounded-lg border border-status-warn-border bg-status-warn-soft/40 px-4 py-2 text-center text-sm font-medium text-status-warn-fg">
          Tu ronda libre se cerrará automáticamente en {freeRoundTimeLeftMinutes} min
        </div>
      )}
      {showFreeRoundCritical && (
        <div className="mx-4 mt-2 animate-pulse rounded-lg border border-status-danger-border bg-status-danger-soft/40 px-4 py-2 text-center text-sm font-semibold text-status-danger-fg">
          Tu ronda se cerrará en {Math.max(0, freeRoundTimeLeftMinutes!)} min — finalízala ahora
        </div>
      )}

      {/* Auto-close warning banner for scheduled rounds approaching next round */}
      {showScheduledWarning && (
        <div className="mx-4 mt-2 rounded-lg border border-status-warn-border bg-status-warn-soft/40 px-4 py-2 text-center text-sm font-medium text-status-warn-fg">
          ⚠ Comienza la próxima ronda en {scheduledMinutesLeft} min — completa esta ronda pronto
        </div>
      )}
      {showScheduledCritical && (
        <div className="mx-4 mt-2 animate-pulse rounded-lg border border-status-danger-border bg-status-danger-soft/40 px-4 py-2 text-center text-sm font-semibold text-status-danger-fg">
          La próxima ronda ya comenzó — esta ronda será cerrada automáticamente. Finalízala ahora.
        </div>
      )}

      {/* ============ Geofence Auto-Prompt Banner ============ */}
      {nearbyCheckpoint && !markingCheckpointId && (
        <div className="relative z-10 mx-4 mt-3 mb-1 rounded-xl border border-status-info-border bg-status-info-soft/80 p-3 shadow-lg shadow-status-info/30 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-info-soft ring-2 ring-status-info-border">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-status-info-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-status-info-fg">
                Estas en {nearbyCheckpoint.name}
              </p>
              <p className="text-xs text-status-info-fg/70">
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
                className="rounded-lg bg-status-info px-4 py-2 text-xs font-semibold text-white shadow-md shadow-status-info/40 transition-colors active:brightness-95"
              >
                Marcar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Leaflet Map — flex-1 fills available space ============ */}
      <div className="relative min-h-0 flex-1" style={{ isolation: "isolate" }}>
        <RondaMap
          checkpoints={mapCheckpoints}
          guardPosition={guardPos}
          height="100%"
          showRoute={true}
          interactive={true}
          showCenterButton={true}
          trailPoints={trailPoints}
          markingCheckpointId={markingCheckpointId}
          isFollowing={isFollowing}
          onManualInteraction={() => setIsFollowing(false)}
          onRecenter={() => setIsFollowing(true)}
          gpsAccuracy={gpsAccuracy}
          closestPendingId={closestPendingId}
          onCheckpointClick={(cpId) => {
            // Manual override: show this checkpoint's card temporarily
            setSelectedCheckpointId(cpId);
            if (selectedOverrideTimerRef.current) clearTimeout(selectedOverrideTimerRef.current);
            selectedOverrideTimerRef.current = setTimeout(() => {
              setSelectedCheckpointId(null);
            }, 10000);
          }}
        />
      </div>

      {/* ============ Bottom fixed area: card + complete button ============ */}
      <div className="shrink-0 pt-3 pb-16" style={{ backgroundColor: "#0a0a0f" }}>
        {/* Ad-hoc free-form: compact bottom panel */}
        {isAdHocFreeForm && (
          <div className="px-2 py-2">
            {/* Compact stats row */}
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-status-ok animate-pulse" />
                <span className="text-xs font-medium text-status-ok-fg">GPS activo</span>
              </div>
              <span className="text-xs text-gray-400">{completedCount} puntos &middot; {formatElapsed(elapsedSeconds)}</span>
            </div>
            {/* Action buttons: GPS + QR side by side */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMarkingCheckpointId("ad-hoc-gps")}
                className="flex items-center justify-center gap-2 rounded-xl border border-status-ok-border bg-status-ok-soft/30 py-3 text-sm font-semibold text-status-ok-fg transition-colors active:brightness-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Marcar GPS
              </button>
              <button
                onClick={() => setMarkingCheckpointId("ad-hoc-scan")}
                className="flex items-center justify-center gap-2 rounded-xl border border-status-info-border bg-status-info-soft/30 py-3 text-sm font-semibold text-status-info-fg transition-colors active:brightness-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Marcar QR
              </button>
            </div>
          </div>
        )}

        {/* Non-ad-hoc: single active checkpoint card */}
        {!isAdHocFreeForm && (() => {
          const allDone = checkpoints.length > 0 && checkpoints.every((c) => c.completed);

          // Determine which checkpoint to show
          const activeCheckpoint = (() => {
            // Manual override from map tap
            if (selectedCheckpointId) {
              const sel = checkpoints.find((c) => c.id === selectedCheckpointId && !c.completed);
              if (sel) return sel;
            }
            // Default: closest pending
            return sortedCheckpoints.find((cp) => !cp.completed) ?? null;
          })();

          const cpDistance = activeCheckpoint && guardPos
            ? haversineDistance(guardPos.lat, guardPos.lng, activeCheckpoint.lat, activeCheckpoint.lng)
            : null;

          const needsQr = activeCheckpoint
            ? rondaData.qrRequerido && (activeCheckpoint.verificationType === "QR" || activeCheckpoint.verificationType === "BOTH")
            : false;

          const cardData = activeCheckpoint
            ? {
                id: activeCheckpoint.id,
                name: activeCheckpoint.name,
                orderIndex: activeCheckpoint.orderIndex,
                isRequired: activeCheckpoint.isRequired,
                distanceM: cpDistance,
                geoRadiusM: activeCheckpoint.geoRadiusM,
                qrRequired: needsQr,
                isInRadius: cpDistance != null && cpDistance <= activeCheckpoint.geoRadiusM,
              }
            : null;

          return (
            <ActiveCheckpointCard
              checkpoint={cardData}
              allCompleted={allDone}
              completedCount={completedCount}
              total={total}
              isMarking={false}
              onConfirmMark={() => {
                if (activeCheckpoint) {
                  // Clear manual override on mark action
                  setSelectedCheckpointId(null);
                  setMarkingCheckpointId(activeCheckpoint.id);
                }
              }}
              transitionState={cardTransition}
            />
          );
        })()}

        {/* Error */}
        {error && (
          <div className="mx-2 mb-2 rounded-lg bg-status-danger-soft px-4 py-2 text-center text-sm text-status-danger-fg">
            {error}
          </div>
        )}
      </div>

      {/* ============ Confirmation Modal (incomplete checkpoints) ============ */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">
              Checkpoints pendientes
            </h2>
            <p className="mb-2 text-base text-gray-300">
              Te faltan{" "}
              <span className="font-semibold text-status-warn-fg">
                {incompleteCheckpoints.length}
              </span>{" "}
              puntos:
            </p>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto">
              {incompleteCheckpoints.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn" />
                  {c.name}
                  {c.isRequired && <span className="text-xs text-status-danger-fg">(obligatorio)</span>}
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
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-status-warn-border focus:outline-none"
            />
            <p className={`mb-3 mt-1 text-xs ${incompleteNotes.trim().length > 0 && incompleteNotes.trim().length < 3 ? "text-status-warn-fg/70" : "text-transparent"}`}>
              Minimo 3 caracteres
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
                disabled={incompleteNotes.trim().length < 3}
                className="flex-1 rounded-xl bg-status-warn py-3 text-base font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-40"
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
          <div className="w-full max-w-sm rounded-2xl border border-status-ok-border bg-gray-900 p-6 text-center">
            <div className="mb-3 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-ok-soft">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-status-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
              className="w-full rounded-xl bg-status-ok py-3.5 text-base font-semibold text-white transition-colors hover:brightness-110 active:brightness-95 disabled:opacity-40"
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
          geoNoVerificada={autoMarkToast.geoNoVerificada}
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
            const isAdHocMarkLocal = cpId === "ad-hoc-gps" || cpId === "ad-hoc-scan";

            if (isAdHocMarkLocal && guardPos) {
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

            // Trigger card transition animation for non-ad-hoc
            if (cpId && !isAdHocMarkLocal) {
              setCardTransition("out");
              setTimeout(() => {
                // Optimistic local update: mark checkpoint as completed
                setCheckpoints((prev) =>
                  prev.map((cp) =>
                    cp.id === cpId ? { ...cp, completed: true } : cp,
                  ),
                );
                // Clear manual override so next closest auto-selects
                setSelectedCheckpointId(null);
                setCardTransition("in");
                setTimeout(() => setCardTransition("idle"), 350);
              }, 250);
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
