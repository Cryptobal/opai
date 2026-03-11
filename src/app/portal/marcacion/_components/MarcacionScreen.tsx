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

interface MarcaResult {
  guardiaName: string;
  tipo: string;
  timestamp: string;
  hashIntegridad: string;
  faceConfidence?: number;
}

type ScreenMode =
  | "idle"
  | "face-capture"
  | "face-register"
  | "pin-entry"
  | "processing"
  | "success"
  | "error";

export function MarcacionScreen({
  deviceToken,
  installationId,
  installationName,
  isOnline,
}: MarcacionScreenProps) {
  const [mode, setMode] = useState<ScreenMode>("idle");
  const [selectedTipo, setSelectedTipo] = useState<MarcaTipo>("entrada");
  const [lastMarca, setLastMarca] = useState<MarcaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // PIN fallback state
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  // Geolocation
  const [geoPosition, setGeoPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Get geolocation on mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { /* geo unavailable */ },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Auto-reset to idle after success/error
  useEffect(() => {
    if (mode === "success" || mode === "error") {
      const timer = setTimeout(() => {
        setMode("idle");
        setError(null);
        setRut("");
        setPin("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  const handleFaceCapture = useCallback(
    async (imageBase64: string) => {
      setMode("processing");
      setError(null);

      try {
        const res = await fetch("/api/public/marcacion/face-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageBase64,
            installationId,
            tipo: selectedTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 404 && data.code === "FACE_NOT_REGISTERED") {
            setMode("face-register");
            return;
          }
          throw new Error(data.error || "Error al verificar rostro");
        }

        setLastMarca({
          guardiaName: data.data.guardiaName,
          tipo: data.data.tipo,
          timestamp: data.data.timestamp,
          hashIntegridad: data.data.hashIntegridad,
          faceConfidence: data.data.faceConfidence,
        });
        setMode("success");
      } catch (err) {
        if (!isOnline) {
          // Queue offline
          MarcacionOfflineQueue.add({
            type: "face",
            imageBase64,
            installationId,
            tipo: selectedTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            deviceTimestamp: new Date().toISOString(),
          });
          setLastMarca({
            guardiaName: "Guardia",
            tipo: selectedTipo,
            timestamp: new Date().toISOString(),
            hashIntegridad: "offline",
          });
          setMode("success");
          return;
        }
        setError(err instanceof Error ? err.message : "Error desconocido");
        setMode("error");
      }
    },
    [installationId, selectedTipo, geoPosition, isOnline]
  );

  const handlePinSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rut || !pin) return;

      setPinLoading(true);
      setError(null);

      try {
        // Get installation marcacionCode from device info
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
            rut,
            pin,
            tipo: selectedTipo,
            lat: geoPosition?.lat ?? 0,
            lng: geoPosition?.lng ?? 0,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Error al registrar marcación");
        }

        setLastMarca({
          guardiaName: data.data.guardiaName,
          tipo: data.data.tipo,
          timestamp: data.data.timestamp,
          hashIntegridad: data.data.hashIntegridad,
        });
        setMode("success");
      } catch (err) {
        if (!isOnline) {
          MarcacionOfflineQueue.add({
            type: "pin",
            rut,
            pin,
            installationId,
            tipo: selectedTipo,
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            deviceTimestamp: new Date().toISOString(),
          });
          setLastMarca({
            guardiaName: rut,
            tipo: selectedTipo,
            timestamp: new Date().toISOString(),
            hashIntegridad: "offline",
          });
          setMode("success");
          return;
        }
        setError(err instanceof Error ? err.message : "Error desconocido");
        setMode("error");
      } finally {
        setPinLoading(false);
      }
    },
    [rut, pin, selectedTipo, geoPosition, deviceToken, installationId, isOnline]
  );

  function handleFaceRegistered() {
    setMode("idle");
    setError(null);
  }

  function startFaceCapture(tipo: MarcaTipo) {
    setSelectedTipo(tipo);
    setMode("face-capture");
  }

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

  // Face registration flow
  if (mode === "face-register") {
    return (
      <FaceRegistrationFlow
        installationId={installationId}
        onRegistered={handleFaceRegistered}
        onCancel={() => setMode("idle")}
      />
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#060a13" }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">GARD SECURITY</h1>
            <p className="text-sm text-white/60">{installationName}</p>
          </div>
          {!isOnline && (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
              Sin conexion
            </span>
          )}
        </div>
        <div className="mt-2 text-center">
          <p className="text-3xl font-mono font-bold text-emerald-400 tabular-nums">{timeStr}</p>
          <p className="text-sm text-white/50 capitalize">{dateStr}</p>
        </div>
      </div>

      {/* Camera / Face capture area */}
      {mode === "face-capture" && (
        <div className="flex-1 px-4 py-2">
          <FaceCameraCapture
            onCapture={handleFaceCapture}
            onCancel={() => setMode("idle")}
          />
        </div>
      )}

      {/* Processing state */}
      {mode === "processing" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-12 w-12 mx-auto animate-spin rounded-full border-3 border-white/20 border-t-emerald-400" />
            <p className="mt-4 text-white/70">Verificando identidad...</p>
          </div>
        </div>
      )}

      {/* Success state */}
      {mode === "success" && lastMarca && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <div className="text-5xl mb-3">{lastMarca.tipo === "entrada" ? "\u2705" : "\uD83D\uDEAA"}</div>
            <p className="text-xl font-bold text-white">{lastMarca.guardiaName}</p>
            <p className="text-emerald-400 font-medium mt-1">
              {lastMarca.tipo === "entrada" ? "Entrada" : "Salida"}{" "}
              {new Date(lastMarca.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
            {lastMarca.faceConfidence && (
              <p className="text-xs text-white/40 mt-1">Face ID {lastMarca.faceConfidence.toFixed(1)}%</p>
            )}
            {lastMarca.hashIntegridad === "offline" && (
              <p className="text-xs text-amber-400 mt-2">Registrada offline. Se sincronizara al recuperar conexion.</p>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {mode === "error" && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="text-5xl mb-3">{"\u274C"}</div>
            <p className="text-red-400 font-medium">{error || "Error al procesar la marcacion"}</p>
            <button
              onClick={() => setMode("idle")}
              className="mt-4 rounded-xl px-6 py-2 text-sm font-medium text-white"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Main idle UI */}
      {mode === "idle" && (
        <div className="flex-1 flex flex-col px-4 py-2">
          {/* Face ID buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => startFaceCapture("entrada")}
              className="rounded-2xl p-6 text-center transition-transform active:scale-95"
              style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              <div className="text-4xl mb-2">{"\u2705"}</div>
              <p className="text-lg font-bold text-emerald-400">ENTRADA</p>
              <p className="text-xs text-white/40 mt-1">Face ID</p>
            </button>
            <button
              onClick={() => startFaceCapture("salida")}
              className="rounded-2xl p-6 text-center transition-transform active:scale-95"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <div className="text-4xl mb-2">{"\uD83D\uDEAA"}</div>
              <p className="text-lg font-bold text-red-400">SALIDA</p>
              <p className="text-xs text-white/40 mt-1">Face ID</p>
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">o marcar con PIN</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* PIN fallback form */}
          <form onSubmit={handlePinSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">RUT</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                inputMode="text"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                maxLength={6}
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="submit"
                onClick={() => setSelectedTipo("entrada")}
                disabled={!rut || !pin || pinLoading}
                className="rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: "rgba(16,185,129,0.3)" }}
              >
                {pinLoading && selectedTipo === "entrada" ? "..." : "ENTRADA"}
              </button>
              <button
                type="submit"
                onClick={() => setSelectedTipo("salida")}
                disabled={!rut || !pin || pinLoading}
                className="rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.3)" }}
              >
                {pinLoading && selectedTipo === "salida" ? "..." : "SALIDA"}
              </button>
            </div>
          </form>

          {/* Last marca display */}
          {lastMarca && mode === "idle" && (
            <div className="mt-4 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs text-white/40">Ultima marca</p>
              <p className="text-sm text-white/70">
                {lastMarca.guardiaName} — {lastMarca.tipo === "entrada" ? "Entrada" : "Salida"}{" "}
                {new Date(lastMarca.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* PIN entry when mode is pin-entry */}
      {mode === "pin-entry" && (
        <div className="flex-1 px-4 py-2">
          <p className="text-white/60 text-sm text-center mb-4">
            Ingresa tu RUT y PIN para marcar {selectedTipo}
          </p>
        </div>
      )}
    </div>
  );
}
