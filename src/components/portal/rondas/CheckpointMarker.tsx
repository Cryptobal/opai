"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { QrScanner } from "./QrScanner";
import { PhotoCapture } from "./PhotoCapture";
import { savePendingMark, getPendingMarks, clearPendingMarks } from "@/lib/rondas-offline";
import { evaluateGeofenceWithTolerance } from "@/lib/rondas/geo-fence-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointTaskInfo {
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

export interface CheckpointInfo {
  id: string;
  name: string;
  instrucciones?: string | null;
  lat: number;
  lng: number;
  geoRadiusM: number;
  verificationType: string; // "QR" | "GPS" | "BOTH"
  tasks?: CheckpointTaskInfo[];
}

export interface MarcarResult {
  id: string;
  trustScore: number;
  anomalies: string[];
  geo: { valid: boolean; distanceM: number | null };
  /** Marca registrada pero geo no verificada en servidor (pendiente revisión). */
  geoNoVerificada?: boolean;
}

interface Props {
  checkpoint: CheckpointInfo;
  ejecucionId: string;
  guardiaId: string;
  qrRequerido: boolean;
  onComplete: (result: MarcarResult) => void;
  onBack: () => void;
  /** Shared guard position from RondaActiva watchPosition — enables real-time distance */
  guardPos?: { lat: number; lng: number } | null;
  /** Whether the guard is currently inside the checkpoint's geofence */
  isInGeofence?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeClientHash(parts: string[]): Promise<string> {
  try {
    const payload = parts.join("|");
    const encoded = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // crypto.subtle unavailable (non-HTTPS context) — return empty string
    return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckpointMarker({
  checkpoint,
  ejecucionId,
  guardiaId,
  qrRequerido,
  onComplete,
  onBack,
  guardPos,
  isInGeofence,
}: Props) {
  // ---- GPS State ----
  const [gpsStatus, setGpsStatus] = useState<"loading" | "success" | "error">("loading");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState("");

  // ---- QR State ----
  const needsQr =
    qrRequerido &&
    (checkpoint.verificationType === "QR" || checkpoint.verificationType === "BOTH");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // ---- Photo State ----
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // ---- Task Responses ----
  const tasks = checkpoint.tasks ?? [];
  const [taskResponses, setTaskResponses] = useState<Record<string, unknown>>({});

  const setTaskResponse = useCallback((taskId: string, value: unknown) => {
    setTaskResponses((prev) => ({ ...prev, [taskId]: value }));
  }, []);

  // Check if all required tasks are answered
  const requiredTasksComplete = tasks
    .filter((t) => t.required)
    .every((t) => {
      const val = taskResponses[t.id];
      if (val === undefined || val === null) return false;
      if (t.type === "boolean") return val === true || val === false;
      if (t.type === "text" || t.type === "select") return typeof val === "string" && val.trim().length > 0;
      if (t.type === "number") return typeof val === "number";
      if (t.type === "checklist") return Array.isArray(val) && val.length > 0;
      return true;
    });

  // ---- Notes ----
  const [note, setNote] = useState("");

  // ---- Submission ----
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  /** Flash ámbar si el backend devolvió GEO_NO_VERIFICADA. */
  const [flashPendingValidation, setFlashPendingValidation] = useState(false);
  /** Confirmación explícita para marcar fuera del radio efectivo (evita tap accidental). */
  const [confirmArrivedAtPoint, setConfirmArrivedAtPoint] = useState(false);

  // ---- Anti-fraud refs ----
  const batteryRef = useRef<number | null>(null);
  const motionScoreRef = useRef<number>(0);
  const motionCountRef = useRef<number>(0);

  // ------------------------------------------------------------------
  // GPS acquisition — use shared guardPos when available, fallback to one-shot
  // ------------------------------------------------------------------
  const requestGps = useCallback(() => {
    setGpsStatus("loading");
    setGpsError("");
    if (!navigator.geolocation) {
      setGpsStatus("error");
      setGpsError("GPS no disponible en este dispositivo");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsAccuracy(pos.coords.accuracy ?? null);
        setGpsStatus("success");
      },
      (err) => {
        setGpsStatus("error");
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGpsError("Permiso de ubicacion denegado");
            break;
          case err.POSITION_UNAVAILABLE:
            setGpsError("Ubicacion no disponible");
            break;
          case err.TIMEOUT:
            setGpsError("Tiempo de espera agotado");
            break;
          default:
            setGpsError("Error al obtener ubicacion");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  // Sync shared guardPos into local coords (real-time updates from parent watchPosition)
  useEffect(() => {
    if (guardPos) {
      setCoords({ lat: guardPos.lat, lng: guardPos.lng });
      setGpsStatus("success");
    }
  }, [guardPos]);

  useEffect(() => {
    // If guardPos is already provided, skip one-shot GPS
    if (guardPos) return;
    requestGps();
  }, [requestGps, guardPos]);

  // ------------------------------------------------------------------
  // Auto-open QR scanner if required
  // ------------------------------------------------------------------
  useEffect(() => {
    if (needsQr && !qrCode) {
      setShowQr(true);
    }
  }, [needsQr, qrCode]);

  // ------------------------------------------------------------------
  // Battery API
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function readBattery() {
      try {
        const batt = await (navigator as any).getBattery?.();
        if (!cancelled && batt) {
          batteryRef.current = Math.round(batt.level * 100);
        }
      } catch {
        // Battery API not available — leave null
      }
    }
    readBattery();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------
  // DeviceMotion — accumulate movement score
  // ------------------------------------------------------------------
  useEffect(() => {
    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      // Subtract ~9.8 (gravity) to get net acceleration
      const net = Math.abs(magnitude - 9.8);
      motionScoreRef.current += net;
      motionCountRef.current += 1;
    }
    try {
      window.addEventListener("devicemotion", handleMotion);
    } catch {
      // Not available
    }
    return () => {
      try {
        window.removeEventListener("devicemotion", handleMotion);
      } catch {
        // ignore
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Online sync — flush pending offline marks when connectivity returns
  // ------------------------------------------------------------------
  useEffect(() => {
    let syncInFlight = false;

    async function syncPending() {
      if (syncInFlight) return;
      syncInFlight = true;
      try {
        const marks = await getPendingMarks();
        if (marks.length === 0) return;
        const res = await fetch("/api/portal/rondas/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marks }),
        });
        if (res.ok) {
          const json = await res.json();
          // Only clear if all marks synced; otherwise keep failed ones
          if ((json.data?.failed ?? 0) === 0) {
            await clearPendingMarks();
          }
          console.log("[Rondas] Synced", json.data?.synced ?? 0, "marks,", json.data?.failed ?? 0, "failed");
        }
      } catch {
        // Will retry next time online
      } finally {
        syncInFlight = false;
      }
    }

    window.addEventListener("online", syncPending);
    // Also try on mount in case we're already online with pending marks
    syncPending();
    return () => window.removeEventListener("online", syncPending);
  }, []);

  // ------------------------------------------------------------------
  // Revoke photo preview URL on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // ------------------------------------------------------------------
  // Calculated values — geocerca con tolerancia por accuracy (Bloque 1)
  // ------------------------------------------------------------------
  const geofenceEval = useMemo(() => {
    if (!coords) return null;
    return evaluateGeofenceWithTolerance(
      coords.lat,
      coords.lng,
      checkpoint.lat,
      checkpoint.lng,
      checkpoint.geoRadiusM,
      gpsAccuracy,
    );
  }, [coords, checkpoint.lat, checkpoint.lng, checkpoint.geoRadiusM, gpsAccuracy]);

  const distanceM = geofenceEval?.distanceM ?? null;
  const inRange = geofenceEval?.inRange ?? false;
  const effectiveRadiusM = geofenceEval?.effectiveRadiusM ?? checkpoint.geoRadiusM;
  const geoConfidence = geofenceEval?.confidence ?? "unknown";

  const requiresGeoInRange =
    !checkpoint.id.startsWith("ad-hoc") &&
    (checkpoint.verificationType === "GEOFENCE" || checkpoint.verificationType === "BOTH");

  const needsConfirmOutside = requiresGeoInRange && !inRange;

  useEffect(() => {
    if (inRange) setConfirmArrivedAtPoint(false);
  }, [inRange]);

  const canSubmit =
    gpsStatus === "success" &&
    !submitting &&
    (needsQr ? qrCode != null : true) &&
    requiredTasksComplete &&
    (!needsConfirmOutside || confirmArrivedAtPoint);

  const primaryMarkLabel = submitting
    ? "Registrando..."
    : needsConfirmOutside
      ? "Marcar de todas formas (fuera de rango)"
      : "Confirmar Marcacion";

  // ------------------------------------------------------------------
  // Photo handlers
  // ------------------------------------------------------------------
  const handlePhotoCapture = useCallback((blob: Blob) => {
    setPhotoPreview(URL.createObjectURL(blob));
    setPhoto(blob);
    setShowCamera(false);
  }, []);

  const removePhoto = useCallback(() => {
    setPhotoPreview(null);
    setPhoto(null);
  }, []);

  // ------------------------------------------------------------------
  // Success sound helper
  // ------------------------------------------------------------------
  function playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* Web Audio not available */ }
  }

  // ------------------------------------------------------------------
  // Submit marcacion
  // ------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!coords || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");

    try {
      // 1. Upload photo if present
      let fotoEvidenciaUrl: string | null = null;
      if (photo) {
        const formData = new FormData();
        formData.append("file", photo, "evidencia.jpg");
        formData.append("ejecucionId", ejecucionId);
        formData.append("guardiaId", guardiaId);
        const uploadRes = await fetch("/api/portal/rondas/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          throw new Error(`Error al subir foto (${uploadRes.status})`);
        }
        const uploadJson = await uploadRes.json();
        if (!uploadJson.success) {
          throw new Error(uploadJson.error || "Error al subir foto");
        }
        fotoEvidenciaUrl = uploadJson.data?.url ?? null;
      }

      // 2. Build motion data
      const movementScore =
        motionCountRef.current > 0
          ? Math.round((motionScoreRef.current / motionCountRef.current) * 100) / 100
          : null;

      // 3. Determine verification method
      const verificationMethod = qrCode ? "QR" : "GEOFENCE";

      // 4. Compute client-side integrity hash
      // clientTimestamp es solo referencia para el hash — el timestamp oficial es del servidor
      const clientTimestamp = new Date().toISOString();
      const clientHash = await computeClientHash([
        checkpoint.id,
        clientTimestamp,
        coords.lat.toString(),
        coords.lng.toString(),
        guardiaId,
      ]);

      // 5. Build task responses
      const taskResponsesPayload = tasks.length > 0
        ? tasks
            .filter((t) => taskResponses[t.id] !== undefined && taskResponses[t.id] !== null)
            .map((t) => ({
              taskId: t.id,
              value: taskResponses[t.id],
            }))
        : undefined;

      // 6. POST marcacion
      const isAdHocMark = checkpoint.id.startsWith("ad-hoc");
      const body = {
        ejecucionId,
        checkpointId: isAdHocMark ? undefined : checkpoint.id,
        checkpointQrCode: qrCode ?? undefined,
        lat: coords.lat,
        lng: coords.lng,
        gpsAccuracy: gpsAccuracy ?? undefined,
        batteryLevel: batteryRef.current,
        motionData: movementScore != null ? { movementScore } : null,
        fotoEvidenciaUrl: fotoEvidenciaUrl ?? undefined,
        note: note.trim() || undefined,
        verificationMethod,
        isOfflineSync: false,
        guardiaId,
        clientHash,
        clientTimestamp,
        taskResponses: taskResponsesPayload,
      };

      let result: MarcarResult;

      try {
        const res = await fetch("/api/portal/rondas/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || `Error del servidor (${res.status})`);
        }

        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || "Error al registrar marcacion");
        }

        result = {
          id: json.data?.id ?? "",
          trustScore: json.data?.trustScore ?? 0,
          anomalies: json.data?.anomalies ?? [],
          geoNoVerificada: json.data?.geoNoVerificada === true,
          geo: {
            valid: json.data?.geo?.valid ?? inRange,
            distanceM: json.data?.geo?.distanceM ?? distanceM,
          },
        };
      } catch (networkErr) {
        // Network error (offline) — save to IndexedDB for later sync
        // TypeError is the standard fetch failure across all browsers (Chrome, Firefox, Safari)
        if (networkErr instanceof TypeError) {
          // Fuera de rango: la marca debe pasar por el servidor (GEO_NO_VERIFICADA). Sin red no se puede encolar de forma fiable.
          if (requiresGeoInRange && !inRange) {
            throw new Error(
              "Sin conexión: para registrar una marca fuera del radio necesitas internet. Cuando vuelva la red, reintenta aquí.",
            );
          }
          try {
            await savePendingMark({ ...body, isOfflineSync: true });
            console.log("[Rondas] Mark saved offline for later sync");
          } catch (idbErr) {
            console.error("[Rondas] Failed to save offline mark:", idbErr);
            throw new Error("Sin conexion y no se pudo guardar localmente");
          }

          // Synthetic result for offline save
          result = {
            id: `offline-${Date.now()}`,
            trustScore: 0,
            anomalies: [],
            geoNoVerificada: false,
            geo: {
              valid: inRange,
              distanceM,
            },
          };
        } else {
          // Server returned an error response — rethrow as-is
          throw networkErr;
        }
      }

      // 6. Success feedback: vibration + sound + flash
      setFlashPendingValidation(result.geoNoVerificada === true);
      navigator.vibrate?.([100, 50, 100]);
      playSuccessSound();
      setShowSuccessFlash(true);
      setTimeout(() => {
        setShowSuccessFlash(false);
        setFlashPendingValidation(false);
        onComplete(result);
      }, 500);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    coords,
    gpsAccuracy,
    photo,
    ejecucionId,
    guardiaId,
    checkpoint.id,
    checkpoint.verificationType,
    qrCode,
    note,
    requiresGeoInRange,
    inRange,
    distanceM,
    onComplete,
    tasks,
    taskResponses,
    checkpoint.geoRadiusM,
  ]);

  // ------------------------------------------------------------------
  // Render: Overlays
  // ------------------------------------------------------------------
  if (showQr) {
    const isAdHoc = checkpoint.id.startsWith("ad-hoc");
    return (
      <QrScanner
        onScan={(code) => {
          setQrCode(code);
          setShowQr(false);
        }}
        onClose={isAdHoc ? onBack : () => setShowQr(false)}
      />
    );
  }

  if (showCamera) {
    return (
      <PhotoCapture
        onCapture={handlePhotoCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  // ------------------------------------------------------------------
  // Render: Ad-hoc GPS compact layout (split screen — no scroll)
  // ------------------------------------------------------------------
  const isAdHocGps = checkpoint.id === "ad-hoc-gps";

  if (isAdHocGps) {
    return (
      <>
        {showCamera && (
          <PhotoCapture
            onCapture={handlePhotoCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        <style>{`
          @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
          .animate-slide-up { animation: slide-up 0.3s ease-out; }
          @keyframes gps-ring { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(2); opacity: 0; } }
        `}</style>

        <div
          className="fixed inset-x-0 top-0 z-[9999] flex flex-col bg-zinc-950"
          style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
        >
          {/* X flotante siempre visible (por si el header queda oculto en vista embebida) */}
          <button
            onClick={onBack}
            className="absolute top-4 right-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition-colors active:bg-white"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* Barra fija arriba: Cancelar + X */}
          <div
            className="shrink-0 flex items-center justify-between px-4 pb-3 bg-zinc-950 border-b border-zinc-800"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <button
              onClick={onBack}
              className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-gray-200 active:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-colors active:bg-zinc-700"
              aria-label="Cerrar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* GPS visual indicator */}
          <div className="flex-1 relative flex items-center justify-center min-h-0">
            <div className="text-center">
              <div className="relative mx-auto h-24 w-24">
                {gpsStatus === "success" && (
                  <span
                    className="absolute inset-0 rounded-full bg-status-ok-soft"
                    style={{ animation: "gps-ring 2s ease-out infinite" }}
                  />
                )}
                {gpsStatus === "loading" && (
                  <span
                    className="absolute inset-0 rounded-full bg-status-warn-soft"
                    style={{ animation: "gps-ring 1.5s ease-out infinite" }}
                  />
                )}
                <div
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-3 ${
                    gpsStatus === "success"
                      ? "border-status-ok-border bg-status-ok-soft"
                      : gpsStatus === "loading"
                        ? "border-status-warn-border bg-status-warn-soft"
                        : "border-status-danger-border bg-status-danger-soft"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-10 w-10 ${
                      gpsStatus === "success"
                        ? "text-status-ok-fg"
                        : gpsStatus === "loading"
                          ? "text-status-warn-fg animate-pulse"
                          : "text-status-danger-fg"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>

              <p className={`mt-3 text-lg font-semibold ${
                gpsStatus === "success" ? "text-status-ok-fg" : gpsStatus === "loading" ? "text-status-warn-fg" : "text-status-danger-fg"
              }`}>
                {gpsStatus === "success" ? "GPS Listo" : gpsStatus === "loading" ? "Obteniendo GPS..." : "Error GPS"}
              </p>
              {gpsStatus === "success" && distanceM != null && (
                <p className="mt-1 text-sm text-status-ok-fg/70">{Math.round(distanceM)}m</p>
              )}
              {gpsStatus === "error" && (
                <button
                  onClick={requestGps}
                  className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-gray-300"
                >
                  Reintentar
                </button>
              )}
            </div>
          </div>

          {/* Bottom: Compact form */}
          <div
            className="shrink-0 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 px-4 pt-3 animate-slide-up"
            style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex justify-center pb-2">
              <div className="w-10 h-1 bg-zinc-600 rounded-full" />
            </div>

            <h2 className="text-base font-semibold text-white mb-3">Punto GPS</h2>

            {/* Photo + Notes in a row */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setShowCamera(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 py-2.5 text-sm text-gray-300 transition-colors active:bg-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {photoPreview ? "Foto tomada" : "Foto"}
              </button>
              {photoPreview && (
                <button
                  onClick={removePhoto}
                  className="rounded-xl border border-status-danger-border bg-status-danger-soft/30 px-3 py-2.5 text-sm text-status-danger-fg"
                >
                  Quitar
                </button>
              )}
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota opcional..."
              maxLength={500}
              className="mb-3 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-status-info-border focus:outline-none"
            />

            {submitError && (
              <div className="mb-3 rounded-lg bg-status-danger-soft px-3 py-2 text-center text-sm text-status-danger-fg">
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full rounded-xl py-3.5 text-base font-semibold transition-colors active:brightness-95 disabled:opacity-40 ${
                needsConfirmOutside
                  ? "border-2 border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                  : "bg-status-info text-white"
              }`}
            >
              {primaryMarkLabel}
            </button>

            {!canSubmit && !submitting && gpsStatus !== "success" && (
              <p className="mt-2 text-center text-xs text-gray-500">Esperando ubicacion GPS</p>
            )}
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Render: Quick Mark — compact view for in-geofence GPS checkpoints
  // ------------------------------------------------------------------
  if (isInGeofence && tasks.length === 0 && !isAdHocGps) {
    return (
      <>
        {showQr && (
          <QrScanner
            onScan={(code) => {
              setQrCode(code);
              setShowQr(false);
            }}
            onClose={() => setShowQr(false)}
          />
        )}
        {showCamera && (
          <PhotoCapture
            onCapture={handlePhotoCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        <style>{`
          @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
          .animate-slide-up { animation: slide-up 0.3s ease-out; }
        `}</style>

        <div
          className="fixed inset-x-0 top-0 z-[9999] flex items-end"
          style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onBack} />
          {/* X flotante para cerrar */}
          <button
            onClick={onBack}
            className="absolute top-4 right-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition-colors active:bg-white"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative w-full max-h-[50vh] bg-zinc-900 rounded-t-2xl overflow-y-auto animate-slide-up">
            {showSuccessFlash && (
              <>
                <div
                  className={`pointer-events-none absolute inset-0 z-50 rounded-t-2xl transition-opacity ${
                    flashPendingValidation ? "bg-status-warn-soft" : "bg-status-ok-soft"
                  }`}
                />
                {flashPendingValidation && (
                  <div className="pointer-events-none absolute inset-0 z-[51] flex items-center justify-center px-3">
                    <p className="rounded-lg bg-status-warn-soft px-3 py-2 text-center text-[13px] font-medium leading-snug text-status-warn-fg">
                      Marcado — pendiente de validación
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-center py-2.5 px-4 sticky top-0 bg-zinc-900 z-10">
              <div className="w-10 h-1 bg-zinc-600 rounded-full" />
            </div>

            <div className="space-y-3 px-4" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
              {/* Checkpoint name + validated badge */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    requiresGeoInRange ? (inRange ? "bg-status-ok-soft" : "bg-status-warn-soft") : "bg-status-ok-soft"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${requiresGeoInRange && !inRange ? "text-status-warn-fg" : "text-status-ok-fg"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-white">{checkpoint.name}</h2>
                  {requiresGeoInRange ? (
                    inRange ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-status-ok-soft px-2 py-0.5 text-xs font-medium text-status-ok-fg">
                        {"\u2713"} Geocerca validada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn-fg">
                        Fuera del radio efectivo — puedes marcar con confirmación
                      </span>
                    )
                  ) : (
                    isInGeofence && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-status-ok-soft px-2 py-0.5 text-xs font-medium text-status-ok-fg">
                        {"\u2713"} En zona
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* QR section — only if checkpoint requires QR */}
              {needsQr && (
                <div>
                  {qrCode ? (
                    <div className="flex items-center gap-2 rounded-lg bg-status-ok-soft/30 px-3 py-2 text-sm text-status-ok-fg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      QR escaneado
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowQr(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-tint-violet-fg/50 bg-tint-violet/30 py-2.5 text-sm font-medium text-tint-violet-fg transition-colors active:brightness-95"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Escanear QR
                    </button>
                  )}
                </div>
              )}

              {/* Optional photo */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCamera(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 py-2 text-sm text-gray-300 transition-colors active:bg-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {photoPreview ? "Foto tomada" : "Foto (opcional)"}
                </button>
                {photoPreview && (
                  <button
                    onClick={removePhoto}
                    className="rounded-xl border border-status-danger-border bg-status-danger-soft/30 px-3 py-2 text-sm text-status-danger-fg"
                  >
                    Quitar
                  </button>
                )}
              </div>

              {submitError && (
                <div className="rounded-lg bg-status-danger-soft px-3 py-2 text-center text-sm text-status-danger-fg">
                  {submitError}
                </div>
              )}

              {needsConfirmOutside && gpsStatus === "success" && distanceM != null && (
                <div className="rounded-xl border border-status-warn-border bg-status-warn-soft/40 p-3 space-y-2">
                  <p className="text-[13px] leading-snug text-status-warn-fg">
                    Estás a {Math.round(distanceM)}m — radio {checkpoint.geoRadiusM}
                    m (efectivo ~{Math.round(effectiveRadiusM)}m). Tu señal GPS es{" "}
                    {geoConfidence === "low" ? "débil" : "imprecisa"}. La marca quedará registrada
                    como &quot;pendiente de validación&quot;.
                  </p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-status-warn-border/60 bg-zinc-900/50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={confirmArrivedAtPoint}
                      onChange={(e) => setConfirmArrivedAtPoint(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded accent-amber-500"
                    />
                    <span className="text-[13px] text-gray-200">
                      Confirmo que estoy en el punto
                    </span>
                  </label>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full rounded-xl py-3.5 text-base font-semibold transition-colors active:brightness-95 disabled:opacity-40 ${
                  needsConfirmOutside
                    ? "border-2 border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                    : "bg-status-ok text-white"
                }`}
                style={{ minHeight: 48 }}
              >
                {primaryMarkLabel}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Render: Bottom sheet (standard checkpoints)
  // ------------------------------------------------------------------
  return (
    <>
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      <div
        className="fixed inset-x-0 top-0 z-[9999] flex items-end"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30" onClick={onBack} />
        {/* X flotante para cerrar (visible en vista embebida) */}
        <button
          onClick={onBack}
          className="absolute top-4 right-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition-colors active:bg-white"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Sheet */}
        <div className="relative w-full max-h-[85vh] bg-zinc-900 rounded-t-2xl flex flex-col animate-slide-up">
          {showSuccessFlash && (
            <>
              <div
                className={`pointer-events-none absolute inset-0 z-50 rounded-t-2xl transition-opacity ${
                  flashPendingValidation ? "bg-status-warn-soft" : "bg-status-ok-soft"
                }`}
              />
              {flashPendingValidation && (
                <div className="pointer-events-none absolute inset-0 z-[51] flex items-center justify-center px-3">
                  <p className="rounded-lg bg-status-warn-soft px-3 py-2 text-center text-[13px] font-medium leading-snug text-status-warn-fg">
                    Marcado — pendiente de validación
                  </p>
                </div>
              )}
            </>
          )}
          {/* Header: drag handle (drag-down or backdrop tap closes) */}
          <div className="flex justify-center py-2.5 px-4 shrink-0 rounded-t-2xl bg-zinc-900">
            <div className="w-10 h-1 bg-zinc-600 rounded-full" />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 space-y-3">
            {/* ---- Checkpoint name + geo status ---- */}
            <div className="flex items-center gap-3">
              {requiresGeoInRange ? (
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    inRange ? "bg-status-ok-soft" : "bg-status-warn-soft"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 ${inRange ? "text-status-ok-fg" : "text-status-warn-fg"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              ) : (
                isInGeofence && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-ok-soft">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-status-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                )
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-white">{checkpoint.name}</h2>
                {requiresGeoInRange ? (
                  inRange ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-ok-soft px-2 py-0.5 text-xs font-medium text-status-ok-fg">
                      {"\u2713"} Geocerca validada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn-fg">
                      Fuera del radio efectivo — puedes marcar con confirmación
                    </span>
                  )
                ) : (
                  isInGeofence && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-ok-soft px-2 py-0.5 text-xs font-medium text-status-ok-fg">
                      {"\u2713"} En zona
                    </span>
                  )
                )}
              </div>
            </div>

            {/* ---- Instructions ---- */}
            {checkpoint.instrucciones && (
              <div className="rounded-lg bg-status-info-soft/30 border border-status-info-border p-3">
                <p className="text-xs font-medium text-status-info-fg mb-1">Instrucciones</p>
                <p className="text-sm text-gray-300">{checkpoint.instrucciones}</p>
              </div>
            )}

            {/* ---- Tasks ---- */}
            {tasks.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-200">
                  Tareas del punto
                  {tasks.some((t) => t.required) && (
                    <span className="text-[11px] text-status-danger-fg ml-1">* obligatorias</span>
                  )}
                </p>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-gray-800 bg-gray-900/60 p-3 space-y-2"
                  >
                    <p className="text-sm text-gray-200">
                      {task.label}
                      {task.required && <span className="text-status-danger-fg ml-1">*</span>}
                    </p>

                    {/* Boolean: Yes/No buttons */}
                    {task.type === "boolean" && (
                      <div className="flex gap-2">
                        {[
                          { val: true, label: "Si", color: "teal" },
                          { val: false, label: "No", color: "red" },
                        ].map((opt) => {
                          const isSelected = taskResponses[task.id] === opt.val;
                          return (
                            <button
                              key={String(opt.val)}
                              type="button"
                              onClick={() => setTaskResponse(task.id, opt.val)}
                              className={`flex-1 rounded-xl py-3.5 text-base font-semibold transition-colors ${
                                isSelected
                                  ? opt.color === "teal"
                                    ? "bg-status-info text-white"
                                    : "bg-status-danger text-white"
                                  : "border border-gray-700 bg-gray-800 text-gray-300"
                              }`}
                              style={{ minHeight: 48 }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Checklist: checkboxes */}
                    {task.type === "checklist" && task.options && (
                      <div className="space-y-1.5">
                        {(task.options as string[]).map((opt) => {
                          const current = (taskResponses[task.id] as string[]) ?? [];
                          const checked = current.includes(opt);
                          return (
                            <label
                              key={opt}
                              className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 cursor-pointer active:bg-gray-700"
                              style={{ minHeight: 48 }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? current.filter((v) => v !== opt)
                                    : [...current, opt];
                                  setTaskResponse(task.id, next);
                                }}
                                className="w-5 h-5 rounded accent-teal-500"
                              />
                              <span className="text-base text-gray-200">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Select: radio buttons */}
                    {task.type === "select" && task.options && (
                      <div className="space-y-1.5">
                        {(task.options as string[]).map((opt) => {
                          const selected = taskResponses[task.id] === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setTaskResponse(task.id, opt)}
                              className={`w-full text-left rounded-xl px-4 py-3 text-base transition-colors ${
                                selected
                                  ? "border-2 border-status-info bg-status-info-soft text-status-info-fg"
                                  : "border border-gray-700 bg-gray-800/50 text-gray-300"
                              }`}
                              style={{ minHeight: 48 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Text input */}
                    {task.type === "text" && (
                      <textarea
                        value={(taskResponses[task.id] as string) ?? ""}
                        onChange={(e) => setTaskResponse(task.id, e.target.value)}
                        placeholder={task.config?.placeholder ?? "Respuesta..."}
                        rows={3}
                        maxLength={1000}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder:text-gray-600 focus:border-status-info-border focus:outline-none"
                      />
                    )}

                    {/* Number input */}
                    {task.type === "number" && (
                      <input
                        type="number"
                        inputMode="decimal"
                        value={(taskResponses[task.id] as number) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTaskResponse(task.id, v === "" ? undefined : Number(v));
                        }}
                        min={task.config?.min}
                        max={task.config?.max}
                        placeholder={
                          task.config?.min != null && task.config?.max != null
                            ? `${task.config.min} - ${task.config.max}`
                            : "Valor..."
                        }
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder:text-gray-600 focus:border-status-info-border focus:outline-none"
                        style={{ minHeight: 48 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ---- GPS Status ---- */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-3">
              <div className="flex items-center gap-3">
                {/* GPS icon */}
                <div className="shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 ${
                      gpsStatus === "loading"
                        ? "animate-pulse text-status-warn-fg"
                        : gpsStatus === "success"
                          ? "text-status-info-fg"
                          : "text-status-danger-fg"
                    }`}
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  {gpsStatus === "loading" && (
                    <span className="text-sm text-status-warn-fg">Obteniendo...</span>
                  )}
                  {gpsStatus === "success" && (
                    <span className="text-sm text-status-info-fg">Listo</span>
                  )}
                  {gpsStatus === "error" && (
                    <span className="text-sm text-status-danger-fg">Error</span>
                  )}
                </div>
              </div>

              {gpsStatus === "error" && gpsError && (
                <p className="mt-1 text-sm text-status-danger-fg">{gpsError}</p>
              )}

              {gpsStatus === "success" && distanceM != null && (
                <p className="mt-1 text-sm">
                  {inRange ? (
                    <span className="font-medium text-status-info-fg">
                      {distanceM < 1000
                        ? `${Math.round(distanceM)}m`
                        : `${(distanceM / 1000).toFixed(1)}km`}
                      {" "}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="ml-0.5 inline-block h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <span className="font-medium text-status-warn-fg">
                      Estas a {distanceM < 1000
                        ? `${Math.round(distanceM)}m`
                        : `${(distanceM / 1000).toFixed(1)}km`}
                      {" "}&mdash; radio: {checkpoint.geoRadiusM}m
                    </span>
                  )}
                </p>
              )}

              {gpsStatus === "error" && (
                <button
                  onClick={requestGps}
                  className="mt-2 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 active:bg-gray-600"
                >
                  Reintentar GPS
                </button>
              )}
            </div>

            {/* ---- QR Status (only if required) ---- */}
            {needsQr && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-3">
                <div className="flex items-center gap-3">
                  {/* QR icon */}
                  <div className="shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-5 w-5 ${qrCode ? "text-status-info-fg" : "text-gray-500"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">
                      QR:{" "}
                      {qrCode ? (
                        <span className="text-status-info-fg">
                          Escaneado
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="ml-1 inline-block h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-gray-400">Pendiente</span>
                      )}
                    </p>

                    {!qrCode && (
                      <button
                        onClick={() => setShowQr(true)}
                        className="mt-2 rounded-xl bg-status-info-soft px-4 py-3 text-base font-medium text-status-info-fg transition-colors hover:brightness-110 active:brightness-95"
                        style={{ minHeight: 48 }}
                      >
                        Escanear QR
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ---- Photo + Notes (compact row) ---- */}
            <div className="flex gap-2">
              {photoPreview ? (
                <button
                  onClick={() => setShowCamera(true)}
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-700"
                >
                  <img src={photoPreview} alt="Evidencia" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => setShowCamera(true)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-700 bg-gray-800/50 text-gray-400 transition-colors active:bg-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota opcional..."
                maxLength={500}
                className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-status-info-border focus:outline-none"
              />
            </div>

          </div>

          {/* ---- Sticky Submit Footer ---- */}
          <div
            className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 pt-3"
            style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {submitError && (
              <div className="mb-2 rounded-lg bg-status-danger-soft px-4 py-2 text-center text-sm text-status-danger-fg">
                {submitError}
              </div>
            )}

            {needsConfirmOutside && gpsStatus === "success" && distanceM != null && (
              <div className="mb-3 rounded-xl border border-status-warn-border bg-status-warn-soft/40 p-3 space-y-2">
                <p className="text-[13px] leading-snug text-status-warn-fg">
                  Estás a {Math.round(distanceM)}m — radio {checkpoint.geoRadiusM}
                  m (efectivo ~{Math.round(effectiveRadiusM)}m). Tu señal GPS es{" "}
                  {geoConfidence === "low" ? "débil" : "imprecisa"}. La marca quedará registrada
                  como &quot;pendiente de validación&quot;.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-status-warn-border/60 bg-zinc-900/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={confirmArrivedAtPoint}
                    onChange={(e) => setConfirmArrivedAtPoint(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded accent-amber-500"
                  />
                  <span className="text-[13px] text-gray-200">Confirmo que estoy en el punto</span>
                </label>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full rounded-xl py-3.5 text-base font-semibold transition-colors hover:brightness-110 active:brightness-95 disabled:opacity-40 ${
                needsConfirmOutside
                  ? "border-2 border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                  : "bg-status-info text-white"
              }`}
              style={{ minHeight: 52 }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
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
                  Registrando...
                </span>
              ) : (
                primaryMarkLabel
              )}
            </button>

            {!canSubmit && !submitting && (
              <p className="mt-1.5 text-center text-xs text-gray-500">
                {gpsStatus !== "success" && "Esperando ubicacion GPS"}
                {gpsStatus === "success" && needsQr && !qrCode && "Escanea el codigo QR del punto"}
                {gpsStatus === "success" && (needsQr ? qrCode != null : true) && !requiredTasksComplete && "Completa las tareas obligatorias"}
                {gpsStatus === "success" && (needsQr ? qrCode != null : true) && requiredTasksComplete && needsConfirmOutside && !confirmArrivedAtPoint && "Confirma que estas en el punto (casilla arriba)"}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
