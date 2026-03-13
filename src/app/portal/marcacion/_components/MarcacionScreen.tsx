"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaceCameraCapture } from "./FaceCameraCapture";
import { FaceRegistrationFlow } from "./FaceRegistrationFlow";
import { MarcacionOfflineQueue } from "./MarcacionOfflineQueue";

interface MarcacionScreenProps {
  deviceToken: string;
  installationId: string;
  installationName: string;
  isOnline: boolean;
}

type MarcaTipo = "entrada" | "salida";

interface GuardiaInfo {
  guardiaId: string;
  name: string;
  photoUrl: string | null;
  faceIdRegistered: boolean;
  faceIdPhotoUrl: string | null;
  faceIdConsentRevoked: boolean;
  nextTipo: MarcaTipo;
}

interface MarcaResult {
  guardiaName: string;
  tipo: MarcaTipo;
  timestamp: string;
  hashIntegridad: string;
  faceConfidence?: number;
  offline?: boolean;
}

type ScreenMode =
  | "rut-entry"       // Step 1: enter RUT
  | "face-verify"     // Step 2: face verification
  | "pin-fallback"    // Fallback: PIN entry
  | "face-register"   // Register face ID for first time
  | "processing"
  | "success"
  | "error";

function normalizeRut(value: string): string {
  return value.replace(/[\s.]/g, "").toLowerCase();
}

/** Formats a RUT as XX.XXX.XXX-X while the user types */
function formatRutInput(value: string): string {
  // Keep only digits and K/k
  const digits = value.replace(/[^0-9kK]/g, "");
  if (digits.length === 0) return "";
  // Always keep dash before last char once we have ≥2 chars
  if (digits.length === 1) return digits;
  const body = digits.slice(0, -1);
  const dv = digits.slice(-1);
  // Add dots every 3 digits from the right of body
  const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${bodyFormatted}-${dv.toUpperCase()}`;
}

export function MarcacionScreen({
  deviceToken,
  installationId,
  installationName,
  isOnline,
}: MarcacionScreenProps) {
  const [mode, setMode] = useState<ScreenMode>("rut-entry");
  const [rutInput, setRutInput] = useState("");
  const [guardiaInfo, setGuardiaInfo] = useState<GuardiaInfo | null>(null);
  const [lastMarca, setLastMarca] = useState<MarcaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // PIN fallback state
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinFallbackReason, setPinFallbackReason] = useState<string>("user_choice");

  // Geolocation
  const [geoPosition, setGeoPosition] = useState<{ lat: number; lng: number } | null>(null);

  const rutInputRef = useRef<HTMLInputElement>(null);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Geolocation
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Auto-reset to rut-entry after success
  useEffect(() => {
    if (mode === "success") {
      const timer = setTimeout(() => {
        setMode("rut-entry");
        setRutInput("");
        setGuardiaInfo(null);
        setError(null);
        setPin("");
        rutInputRef.current?.focus();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // Auto-reset error after 4s
  useEffect(() => {
    if (mode === "error") {
      const timer = setTimeout(() => {
        setMode("rut-entry");
        setRutInput("");
        setGuardiaInfo(null);
        setError(null);
        setPin("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // Focus RUT input on mount and after reset
  useEffect(() => {
    if (mode === "rut-entry") {
      setTimeout(() => rutInputRef.current?.focus(), 100);
    }
  }, [mode]);

  // ── Step 1: RUT lookup ──────────────────────────────────────────────────
  const handleRutSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const rut = rutInput.trim();
      if (!rut) return;

      setLookupLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/public/marcacion/lookup-guardia?rut=${encodeURIComponent(rut)}&installationId=${installationId}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "No se encontró el guardia");
        }

        setGuardiaInfo(data.data as GuardiaInfo);
        setMode("face-verify");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al buscar guardia");
      } finally {
        setLookupLoading(false);
      }
    },
    [rutInput, installationId]
  );

  // ── Step 2: Face capture → verification ────────────────────────────────
  const handleFaceCapture = useCallback(
    async (imageBase64: string) => {
      if (!guardiaInfo) return;
      setMode("processing");
      setError(null);

      try {
        const res = await fetch("/api/public/marcacion/face-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageBase64,
            installationId,
            tipo: guardiaInfo.nextTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            expectedGuardiaId: guardiaInfo.guardiaId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // CRITICAL: Only offer enrollment when guard has NO Face ID registered.
          // If faceIdRegistered is true and verification failed → FACE_MISMATCH (wrong person).
          // Never offer enrollment in that case — reject with clear message.
          if (
            res.status === 404 &&
            data.code === "FACE_NOT_REGISTERED" &&
            !guardiaInfo.faceIdRegistered
          ) {
            setMode("face-register");
            return;
          }
          // Face mismatch or AWS error → suggest PIN fallback
          setPinFallbackReason(data.code === "FACE_MISMATCH" ? "face_mismatch" : "aws_error");
          throw new Error(data.error || "No se pudo verificar el rostro");
        }

        setLastMarca({
          guardiaName: data.data.guardiaName,
          tipo: data.data.tipo as MarcaTipo,
          timestamp: data.data.timestamp,
          hashIntegridad: data.data.hashIntegridad,
          faceConfidence: data.data.faceConfidence,
        });
        setMode("success");
      } catch (err) {
        if (!isOnline) {
          MarcacionOfflineQueue.add({
            type: "face",
            imageBase64,
            installationId,
            tipo: guardiaInfo.nextTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            deviceTimestamp: new Date().toISOString(),
          });
          setLastMarca({
            guardiaName: guardiaInfo.name,
            tipo: guardiaInfo.nextTipo,
            timestamp: new Date().toISOString(),
            hashIntegridad: "offline",
            offline: true,
          });
          setMode("success");
          return;
        }
        setError(err instanceof Error ? err.message : "Error desconocido");
        setMode("face-verify"); // stay on face-verify showing error, not crash to error screen
      }
    },
    [guardiaInfo, installationId, geoPosition, isOnline]
  );

  // ── PIN fallback submission ─────────────────────────────────────────────
  const handlePinSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pin || !guardiaInfo) return;

      setPinLoading(true);
      setError(null);

      try {
        const configRes = await fetch("/api/devices/validate", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        });
        const configData = await configRes.json();
        const marcacionCode = configData.marcacionCode;

        if (!marcacionCode) {
          throw new Error("Instalación no tiene código de marcación configurado");
        }

        const res = await fetch("/api/public/marcacion/registrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: marcacionCode,
            rut: normalizeRut(rutInput),
            pin,
            tipo: guardiaInfo.nextTipo,
            lat: geoPosition?.lat ?? 0,
            lng: geoPosition?.lng ?? 0,
            pinFallbackReason,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Error al registrar marcación");
        }

        setLastMarca({
          guardiaName: data.data.guardiaName,
          tipo: data.data.tipo as MarcaTipo,
          timestamp: data.data.timestamp,
          hashIntegridad: data.data.hashIntegridad,
        });
        setMode("success");
      } catch (err) {
        if (!isOnline) {
          MarcacionOfflineQueue.add({
            type: "pin",
            rut: normalizeRut(rutInput),
            pin,
            installationId,
            tipo: guardiaInfo.nextTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            deviceTimestamp: new Date().toISOString(),
          });
          setLastMarca({
            guardiaName: guardiaInfo.name,
            tipo: guardiaInfo.nextTipo,
            timestamp: new Date().toISOString(),
            hashIntegridad: "offline",
            offline: true,
          });
          setMode("success");
          return;
        }
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setPinLoading(false);
      }
    },
    [pin, guardiaInfo, rutInput, deviceToken, installationId, geoPosition, isOnline, pinFallbackReason]
  );

  const timeStr = currentTime.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = currentTime.toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Shared header ───────────────────────────────────────────────────────
  const Header = () => (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">GARD SECURITY</h1>
          <p className="text-sm text-white/60">{installationName}</p>
        </div>
        {!isOnline && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
            Sin conexión
          </span>
        )}
      </div>
      <div className="mt-2 text-center">
        <p className="text-3xl font-mono font-bold text-emerald-400 tabular-nums">{timeStr}</p>
        <p className="text-sm text-white/50 capitalize">{dateStr}</p>
      </div>
    </div>
  );

  // ── Face registration flow ──────────────────────────────────────────────
  if (mode === "face-register" && guardiaInfo) {
    return (
      <FaceRegistrationFlow
        installationId={installationId}
        prefillRut={rutInput}
        onRegistered={() => {
          // Mark face as registered so face-verify shows the camera immediately
          setGuardiaInfo((prev) => prev ? { ...prev, faceIdRegistered: true } : prev);
          setMode("face-verify");
          setError(null);
        }}
        onCancel={() => setMode("face-verify")}
      />
    );
  }

  // ── Processing spinner ──────────────────────────────────────────────────
  if (mode === "processing") {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-12 w-12 mx-auto animate-spin rounded-full border-3 border-white/20 border-t-emerald-400" />
            <p className="mt-4 text-white/70">Verificando identidad...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (mode === "success" && lastMarca) {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div
            className="w-full max-w-sm rounded-2xl p-8 text-center"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
          >
            <div className="text-6xl mb-4">{lastMarca.tipo === "entrada" ? "✅" : "🚪"}</div>
            <p className="text-2xl font-bold text-white">{lastMarca.guardiaName}</p>
            <p className="text-emerald-400 font-semibold mt-2 text-lg">
              {lastMarca.tipo === "entrada" ? "ENTRADA" : "SALIDA"}{" "}
              {new Date(lastMarca.timestamp).toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </p>
            {lastMarca.faceConfidence && (
              <p className="text-xs text-white/40 mt-2">
                Face ID · {lastMarca.faceConfidence.toFixed(1)}% confianza
              </p>
            )}
            {lastMarca.offline && (
              <p className="text-xs text-amber-400 mt-3">
                Registrada offline — se sincronizará al recuperar conexión
              </p>
            )}
            <p className="text-xs text-white/25 mt-4">Vuelve a pantalla principal en 5s...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────
  if (mode === "error") {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <div className="text-5xl mb-3">❌</div>
            <p className="text-red-400 font-medium">{error}</p>
            <p className="text-xs text-white/30 mt-3">Vuelve a pantalla principal en 4s...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: RUT entry ───────────────────────────────────────────────────
  if (mode === "rut-entry") {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex flex-col justify-center px-4 pb-8">
          <div className="mb-8 text-center">
            <p className="text-white/60 text-sm">Ingresa tu RUT para identificarte</p>
          </div>

          <form onSubmit={handleRutSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-2 text-center tracking-widest uppercase">
                RUT
              </label>
              <input
                ref={rutInputRef}
                type="text"
                value={rutInput}
                onChange={(e) => {
                  setRutInput(formatRutInput(e.target.value));
                }}
                placeholder="13.255.838-8"
                className="w-full rounded-2xl px-5 py-4 text-white text-xl text-center placeholder-white/15 outline-none tracking-widest"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", fontSize: "1.5rem" }}
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!rutInput.trim() || lookupLoading}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition-opacity disabled:opacity-40"
              style={{ background: "rgba(16,185,129,0.4)", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              {lookupLoading ? "Buscando..." : "Continuar →"}
            </button>
          </form>

          {lastMarca && (
            <div className="mt-8 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs text-white/30">Última marca registrada</p>
              <p className="text-sm text-white/60 mt-1">
                {lastMarca.guardiaName} — {lastMarca.tipo === "entrada" ? "Entrada" : "Salida"}{" "}
                {new Date(lastMarca.timestamp).toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Face verify (or no face ID registered) ──────────────────────
  if (mode === "face-verify" && guardiaInfo) {
    const tipo = guardiaInfo.nextTipo;
    const tipoColor = tipo === "entrada" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)";
    const tipoBorder = tipo === "entrada" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)";
    const tipoText = tipo === "entrada" ? "text-emerald-400" : "text-red-400";

    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex flex-col px-4 pb-6">
          {/* Guardia greeting */}
          <div className="flex items-center gap-3 my-4">
            {guardiaInfo.photoUrl ? (
              <img
                src={guardiaInfo.photoUrl}
                alt={guardiaInfo.name}
                className="h-14 w-14 rounded-full object-cover"
                style={{ border: `2px solid ${tipoColor}` }}
              />
            ) : (
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center text-2xl font-bold text-white/60"
                style={{ background: "rgba(255,255,255,0.08)", border: `2px solid ${tipoColor}` }}
              >
                {guardiaInfo.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs text-white/40">Hola,</p>
              <p className="text-lg font-bold text-white">{guardiaInfo.name}</p>
              <p className={`text-sm font-semibold ${tipoText}`}>
                Tu siguiente marca: {tipo === "entrada" ? "ENTRADA" : "SALIDA"}
              </p>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl p-3 mb-3 text-sm text-red-400 text-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              {error}
            </div>
          )}

          {/* Main face capture area */}
          {guardiaInfo.faceIdRegistered ? (
            <div className="flex-1 flex flex-col">
              <FaceCameraCapture
                onCapture={handleFaceCapture}
                onCancel={() => {
                  setMode("rut-entry");
                  setGuardiaInfo(null);
                  setError(null);
                }}
                captureLabel={`Marcar ${tipo === "entrada" ? "Entrada" : "Salida"}`}
                captureColor={tipoColor}
              />
            </div>
          ) : (
            // No face ID registered yet
            <div
              className="flex-1 flex flex-col items-center justify-center rounded-2xl p-6 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
            >
              <div className="text-4xl mb-3">🤳</div>
              <p className="text-white font-semibold mb-2">No tienes Face ID activado</p>
              <p className="text-white/50 text-sm mb-6">
                Registra tu rostro para poder marcar con Face ID
              </p>
              <button
                onClick={() => setMode("face-register")}
                className="w-full max-w-xs rounded-xl py-3 text-sm font-bold text-white mb-3"
                style={{ background: "rgba(16,185,129,0.4)", border: "1px solid rgba(16,185,129,0.3)" }}
              >
                Registrar Face ID ahora
              </button>
            </div>
          )}

          {/* PIN fallback link */}
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setPinFallbackReason("user_choice");
                setMode("pin-fallback");
              }}
              className="text-xs text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
            >
              ¿Problemas con la cámara? Usar PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PIN fallback ────────────────────────────────────────────────────────
  if (mode === "pin-fallback" && guardiaInfo) {
    const tipo = guardiaInfo.nextTipo;

    return (
      <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
        <Header />
        <div className="flex-1 flex flex-col justify-center px-4 pb-8">
          {/* Warning badge */}
          <div
            className="rounded-xl p-3 mb-6 text-center"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <p className="text-amber-400 text-xs font-medium">
              ⚠️ Marcación con PIN — requiere validación del supervisor
            </p>
          </div>

          {/* Guardia info */}
          <div className="mb-6 text-center">
            <p className="text-white font-bold text-lg">{guardiaInfo.name}</p>
            <p className={`text-sm font-semibold ${tipo === "entrada" ? "text-emerald-400" : "text-red-400"}`}>
              {tipo === "entrada" ? "ENTRADA" : "SALIDA"}
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-2 text-center tracking-widest uppercase">
                PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                maxLength={6}
                className="w-full rounded-2xl px-5 py-4 text-white text-xl text-center placeholder-white/15 outline-none tracking-widest"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", fontSize: "2rem", letterSpacing: "0.5rem" }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!pin || pinLoading}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition-opacity disabled:opacity-40"
              style={{
                background: tipo === "entrada" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)",
                border: `1px solid ${tipo === "entrada" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              }}
            >
              {pinLoading ? "Registrando..." : `Marcar ${tipo === "entrada" ? "Entrada" : "Salida"} con PIN`}
            </button>
          </form>

          <button
            onClick={() => setMode("face-verify")}
            className="mt-5 w-full text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            ← Volver a Face ID
          </button>
        </div>
      </div>
    );
  }

  // Fallback (should not reach)
  return null;
}
