"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { QrScanner } from "./QrScanner";
import { PhotoCapture } from "./PhotoCapture";
import { savePendingMark, getPendingMarks, clearPendingMarks } from "@/lib/rondas-offline";

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

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  // Calculated values
  // ------------------------------------------------------------------
  const distanceM =
    coords != null
      ? haversineM(coords.lat, coords.lng, checkpoint.lat, checkpoint.lng)
      : null;

  const withinRadius =
    distanceM != null && distanceM <= checkpoint.geoRadiusM;

  const canSubmit =
    gpsStatus === "success" && !submitting && (needsQr ? qrCode != null : true) && requiredTasksComplete;

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
      const timestamp = new Date().toISOString();
      const clientHash = await computeClientHash([
        checkpoint.id,
        timestamp,
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
        clientTimestamp: timestamp,
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
          geo: {
            valid: json.data?.geo?.valid ?? withinRadius,
            distanceM: json.data?.geo?.distanceM ?? distanceM,
          },
        };
      } catch (networkErr) {
        // Network error (offline) — save to IndexedDB for later sync
        // TypeError is the standard fetch failure across all browsers (Chrome, Firefox, Safari)
        if (networkErr instanceof TypeError) {
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
            geo: {
              valid: withinRadius,
              distanceM,
            },
          };
        } else {
          // Server returned an error response — rethrow as-is
          throw networkErr;
        }
      }

      // 6. Success feedback: vibration + sound + flash
      navigator.vibrate?.([100, 50, 100]);
      playSuccessSound();
      setShowSuccessFlash(true);
      setTimeout(() => {
        setShowSuccessFlash(false);
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
    qrCode,
    note,
    withinRadius,
    distanceM,
    onComplete,
  ]);

  // ------------------------------------------------------------------
  // Render: Overlays
  // ------------------------------------------------------------------
  if (showQr) {
    return (
      <QrScanner
        onScan={(code) => {
          setQrCode(code);
          setShowQr(false);
        }}
        onClose={() => setShowQr(false)}
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

        <div className="fixed inset-0 z-[1100] flex flex-col bg-zinc-950">
          {/* Top: GPS visual indicator */}
          <div className="flex-1 relative flex items-center justify-center">
            {/* Cancel button */}
            <button
              onClick={onBack}
              className="absolute top-4 left-4 z-10 rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-gray-300 backdrop-blur-sm"
            >
              Cancelar
            </button>

            <div className="text-center">
              <div className="relative mx-auto h-24 w-24">
                {gpsStatus === "success" && (
                  <span
                    className="absolute inset-0 rounded-full bg-emerald-500/30"
                    style={{ animation: "gps-ring 2s ease-out infinite" }}
                  />
                )}
                {gpsStatus === "loading" && (
                  <span
                    className="absolute inset-0 rounded-full bg-yellow-500/20"
                    style={{ animation: "gps-ring 1.5s ease-out infinite" }}
                  />
                )}
                <div
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-3 ${
                    gpsStatus === "success"
                      ? "border-emerald-500/50 bg-emerald-500/15"
                      : gpsStatus === "loading"
                        ? "border-yellow-500/50 bg-yellow-500/10"
                        : "border-red-500/50 bg-red-500/10"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-10 w-10 ${
                      gpsStatus === "success"
                        ? "text-emerald-400"
                        : gpsStatus === "loading"
                          ? "text-yellow-400 animate-pulse"
                          : "text-red-400"
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
                gpsStatus === "success" ? "text-emerald-400" : gpsStatus === "loading" ? "text-yellow-400" : "text-red-400"
              }`}>
                {gpsStatus === "success" ? "GPS Listo" : gpsStatus === "loading" ? "Obteniendo GPS..." : "Error GPS"}
              </p>
              {gpsStatus === "success" && distanceM != null && (
                <p className="mt-1 text-sm text-emerald-300/70">{Math.round(distanceM)}m</p>
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
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
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
                  className="rounded-xl border border-red-800/50 bg-red-950/20 px-3 py-2.5 text-sm text-red-400"
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
              className="mb-3 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
            />

            {submitError && (
              <div className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-center text-sm text-red-300">
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white transition-colors active:bg-teal-700 disabled:opacity-40"
            >
              {submitting ? "Registrando..." : "Confirmar Marcacion"}
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

      <div className="fixed inset-0 z-[1100] flex items-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" onClick={onBack} />

        {/* Sheet */}
        <div className="relative w-full max-h-[60vh] bg-zinc-900 rounded-t-2xl overflow-y-auto animate-slide-up">
          {showSuccessFlash && (
            <div className="pointer-events-none absolute inset-0 z-50 rounded-t-2xl bg-emerald-500/20 transition-opacity" />
          )}
          {/* Drag handle */}
          <div className="flex justify-center py-3 sticky top-0 bg-zinc-900 z-10">
            <div className="w-10 h-1 bg-zinc-600 rounded-full" />
          </div>

          {/* Content */}
          <div className="space-y-4 px-4" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}>
            {/* ---- Checkpoint name ---- */}
            <h2 className="text-lg font-semibold text-white">{checkpoint.name}</h2>

            {/* ---- Instructions ---- */}
            {checkpoint.instrucciones && (
              <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 p-3">
                <p className="text-xs font-medium text-blue-400 mb-1">Instrucciones</p>
                <p className="text-sm text-gray-300">{checkpoint.instrucciones}</p>
              </div>
            )}

            {/* ---- Tasks ---- */}
            {tasks.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-200">
                  Tareas del punto
                  {tasks.some((t) => t.required) && (
                    <span className="text-[11px] text-red-400 ml-1">* obligatorias</span>
                  )}
                </p>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2"
                  >
                    <p className="text-sm text-gray-200">
                      {task.label}
                      {task.required && <span className="text-red-400 ml-1">*</span>}
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
                                    ? "bg-teal-600 text-white"
                                    : "bg-red-600 text-white"
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
                                  ? "border-2 border-teal-500 bg-teal-950/40 text-teal-300"
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
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
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
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
                        style={{ minHeight: 48 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ---- GPS Status ---- */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="flex items-center gap-3">
                {/* GPS icon */}
                <div className="shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 ${
                      gpsStatus === "loading"
                        ? "animate-pulse text-yellow-400"
                        : gpsStatus === "success"
                          ? "text-teal-400"
                          : "text-red-400"
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
                    <span className="text-sm text-yellow-400">Obteniendo...</span>
                  )}
                  {gpsStatus === "success" && (
                    <span className="text-sm text-teal-400">Listo</span>
                  )}
                  {gpsStatus === "error" && (
                    <span className="text-sm text-red-400">Error</span>
                  )}
                </div>
              </div>

              {gpsStatus === "error" && gpsError && (
                <p className="mt-1 text-sm text-red-400">{gpsError}</p>
              )}

              {gpsStatus === "success" && distanceM != null && (
                <p className="mt-1 text-sm">
                  {withinRadius ? (
                    <span className="font-medium text-teal-400">
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
                    <span className="font-medium text-yellow-400">
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
              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex items-center gap-3">
                  {/* QR icon */}
                  <div className="shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-5 w-5 ${qrCode ? "text-teal-400" : "text-gray-500"}`}
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
                        <span className="text-teal-400">
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
                        className="mt-2 rounded-xl bg-teal-600/20 px-4 py-3 text-base font-medium text-teal-400 transition-colors hover:bg-teal-600/30 active:bg-teal-600/40"
                        style={{ minHeight: 48 }}
                      >
                        Escanear QR
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ---- Photo ---- */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              {photoPreview ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-medium text-gray-200">Foto Evidencia</p>
                    <button
                      onClick={removePhoto}
                      className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-gray-700"
                    >
                      Eliminar
                    </button>
                  </div>
                  <img
                    src={photoPreview}
                    alt="Evidencia"
                    className="h-40 w-full rounded-xl object-cover"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowCamera(true)}
                  className="flex w-full items-center gap-3 rounded-xl bg-gray-800/50 px-4 py-4 text-left transition-colors hover:bg-gray-800 active:bg-gray-700"
                  style={{ minHeight: 56 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 shrink-0 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span className="text-base text-gray-300">Agregar Foto</span>
                </button>
              )}
            </div>

            {/* ---- Notes ---- */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <label htmlFor="checkpoint-note" className="mb-2 block text-base font-medium text-gray-200">
                Notas (opcional)
              </label>
              <textarea
                id="checkpoint-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observaciones del punto..."
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* ---- Error ---- */}
            {submitError && (
              <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
                {submitError}
              </div>
            )}

            {/* ---- Submit Button ---- */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-40"
              style={{ minHeight: 56 }}
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
                "Confirmar Marcacion"
              )}
            </button>

            {/* ---- Disabled reason hint ---- */}
            {!canSubmit && !submitting && (
              <p className="text-center text-sm text-gray-500">
                {gpsStatus !== "success" && "Esperando ubicacion GPS"}
                {gpsStatus === "success" && needsQr && !qrCode && "Escanea el codigo QR del punto"}
                {gpsStatus === "success" && (needsQr ? qrCode != null : true) && !requiredTasksComplete && "Completa las tareas obligatorias"}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
