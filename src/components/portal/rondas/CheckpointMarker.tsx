"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { QrScanner } from "./QrScanner";
import { PhotoCapture } from "./PhotoCapture";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  geoRadiusM: number;
  verificationType: string; // "QR" | "GPS" | "BOTH"
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

  // ---- Notes ----
  const [note, setNote] = useState("");

  // ---- Submission ----
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");

  // ---- Anti-fraud refs ----
  const batteryRef = useRef<number | null>(null);
  const motionScoreRef = useRef<number>(0);
  const motionCountRef = useRef<number>(0);

  // ------------------------------------------------------------------
  // GPS acquisition
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

  useEffect(() => {
    requestGps();
  }, [requestGps]);

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
    gpsStatus === "success" && !submitting && (needsQr ? qrCode != null : true);

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

      // 5. POST marcacion
      const body = {
        ejecucionId,
        checkpointId: checkpoint.id,
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
      };

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

      // 6. Haptic feedback
      navigator.vibrate?.(200);

      // 7. Callback
      const result: MarcarResult = {
        id: json.data?.id ?? "",
        trustScore: json.data?.trustScore ?? 0,
        anomalies: json.data?.anomalies ?? [],
        geo: {
          valid: json.data?.geo?.valid ?? withinRadius,
          distanceM: json.data?.geo?.distanceM ?? distanceM,
        },
      };
      onComplete(result);
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
  // Render: Main screen
  // ------------------------------------------------------------------
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
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
            {checkpoint.name}
          </h1>
        </div>
      </header>

      {/* ============ Content ============ */}
      <main className="flex-1 space-y-5 px-4 pb-8 pt-5">
        {/* ---- GPS Status ---- */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex items-start gap-3">
            {/* GPS icon */}
            <div className="mt-0.5 shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-6 w-6 ${
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
              <p className="text-base font-medium text-gray-200">
                GPS:{" "}
                {gpsStatus === "loading" && (
                  <span className="text-yellow-400">Obteniendo...</span>
                )}
                {gpsStatus === "success" && (
                  <span className="text-teal-400">Listo</span>
                )}
                {gpsStatus === "error" && (
                  <span className="text-red-400">Error</span>
                )}
              </p>

              {gpsStatus === "error" && gpsError && (
                <p className="mt-1 text-sm text-red-400">{gpsError}</p>
              )}

              {gpsStatus === "success" && distanceM != null && (
                <p className="mt-1 text-sm">
                  <span className="text-gray-400">Distancia: </span>
                  <span
                    className={
                      withinRadius ? "font-medium text-teal-400" : "font-medium text-yellow-400"
                    }
                  >
                    {distanceM < 1000
                      ? `${Math.round(distanceM)}m`
                      : `${(distanceM / 1000).toFixed(1)}km`}
                  </span>
                  {withinRadius ? (
                    <span className="ml-1.5 text-teal-400">
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
                    <span className="ml-1.5 text-sm text-yellow-400">
                      (fuera del radio de {checkpoint.geoRadiusM}m)
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
          </div>
        </div>

        {/* ---- QR Status (only if required) ---- */}
        {needsQr && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <div className="flex items-start gap-3">
              {/* QR icon */}
              <div className="mt-0.5 shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-6 w-6 ${qrCode ? "text-teal-400" : "text-gray-500"}`}
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
                <p className="text-base font-medium text-gray-200">
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
          </p>
        )}
      </main>
    </div>
  );
}
