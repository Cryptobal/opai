"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Shield,
  MapPin,
  Clock,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  History,
  ChevronLeft,
  Loader2,
  Camera,
  MapPinOff,
} from "lucide-react";

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

type Screen = "login" | "marcar" | "confirmacion" | "historial" | "error";

interface ValidacionData {
  guardiaId: string;
  guardiaName: string;
  installationId: string;
  installationName: string;
  lat: number | null;
  lng: number | null;
  geoRadiusM: number;
  siguienteAccion: "entrada" | "salida";
  ultimaMarcacion: { tipo: string; timestamp: string } | null;
}

interface MarcacionResult {
  id: string;
  tipo: string;
  timestamp: string;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  guardiaName: string;
  installationName: string;
  hashIntegridad: string;
}

interface HistorialItem {
  id: string;
  tipo: string;
  timestamp: string;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  hash: string;
}

// ─────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────

export function MarcacionClient({ code }: { code: string }) {
  const [screen, setScreen] = useState<Screen>("login");
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validacion, setValidacion] = useState<ValidacionData | null>(null);
  const [resultado, setResultado] = useState<MarcacionResult | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);

  // ─── Formatear RUT ───
  const handleRutChange = (value: string) => {
    // Limpiar todo excepto números, K y guión
    const clean = value.replace(/[^0-9kK-]/g, "").toUpperCase();
    // Limitar largo total (8 dígitos + guión + dv = 10 chars max)
    const limited = clean.slice(0, 10);
    // Si el usuario ya puso guión manualmente, respetar
    if (limited.includes("-")) {
      setRut(limited);
      return;
    }
    // Auto-agregar guión solo cuando hay 8+ dígitos (RUT completo)
    if (limited.length >= 9) {
      const body = limited.slice(0, -1);
      const dv = limited.slice(-1);
      setRut(`${body}-${dv}`);
      return;
    }
    setRut(limited);
  };

  // ─── Validar RUT + PIN ───
  const handleLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/public/marcacion/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, rut, pin }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Error de validación");
        setLoading(false);
        return;
      }
      setValidacion(data.data);
      setScreen("marcar");
    } catch {
      setError("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [code, rut, pin]);

  // ─── Estado de geolocalización ───
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied" | "error">("pending");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ─── Solicitar geolocalización al entrar a pantalla de marcación ───
  const requestGeo = useCallback(() => {
    setGeoStatus("pending");
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setError("Tu navegador no soporta geolocalización. No puedes marcar asistencia.");
      return;
    }
    // Verificar que estamos en un contexto seguro (HTTPS) — necesario para GPS
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGeoStatus("error");
      setError("Esta página debe abrirse con HTTPS para acceder al GPS. Contacta a tu supervisor.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("granted");
        setError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus("denied");
          setError("Debes permitir el acceso a tu ubicación para marcar asistencia. Toca \"Reintentar\" después de activar la ubicación.");
        } else if (err.code === err.TIMEOUT) {
          setGeoStatus("error");
          setError("No se pudo obtener tu ubicación a tiempo. Verifica que el GPS esté activado y reintenta.");
        } else {
          setGeoStatus("error");
          setError("No se pudo obtener tu ubicación. Verifica que el GPS esté activado.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // ─── Captura de foto (cámara frontal) ───
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      if (!window.isSecureContext) {
        setError("La cámara requiere conexión HTTPS. Contacta a tu supervisor.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setError(null);
    } catch {
      setError("No se pudo acceder a la cámara. Permite el acceso en los ajustes de tu navegador.");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 480, 480);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    setFotoBase64(dataUrl);
    // Detener cámara
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
    return dataUrl;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  }, []);

  // ─── Registrar marcación ───
  const handleMarcar = useCallback(
    async (tipo: "entrada" | "salida") => {
      setError(null);
      setLoading(true);

      // 1. Verificar que tenemos geolocalización
      if (!geoCoords) {
        setError("Ubicación no disponible. Activa el GPS y permite el acceso a tu ubicación.");
        setLoading(false);
        return;
      }

      // 2. Capturar foto si la cámara está activa
      let foto = fotoBase64;
      if (cameraActive && !foto) {
        foto = capturePhoto();
      }

      try {
        const res = await fetch("/api/public/marcacion/registrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            rut,
            pin,
            tipo,
            lat: geoCoords.lat,
            lng: geoCoords.lng,
            fotoBase64: foto || undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Error al registrar");
          setLoading(false);
          return;
        }
        // Limpiar foto y cámara
        stopCamera();
        setFotoBase64(null);
        setResultado(data.data);
        setScreen("confirmacion");
      } catch {
        setError("Error de conexión. Verifica tu internet.");
      } finally {
        setLoading(false);
      }
    },
    [code, rut, pin, geoCoords, fotoBase64, cameraActive, capturePhoto, stopCamera]
  );

  // ─── Cargar historial ───
  const handleHistorial = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ code, rut, pin });
      const res = await fetch(
        `/api/public/marcacion/mis-marcaciones?${params.toString()}`
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Error al cargar historial");
        setLoading(false);
        return;
      }
      setHistorial(data.data.marcaciones);
      setScreen("historial");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }, [code, rut, pin]);

  // ─── Nueva marcación (resetear) ───
  const handleNuevaMarcacion = () => {
    setScreen("marcar");
    setResultado(null);
    setError(null);
    // Refrescar estado
    handleLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 mb-3">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Marcación de Asistencia</h1>
          <p className="text-slate-400 text-sm mt-1">Gard Security</p>
        </div>

        {/* Contenido */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {screen === "login" && (
            <LoginScreen
              rut={rut}
              pin={pin}
              loading={loading}
              error={error}
              onRutChange={handleRutChange}
              onPinChange={setPin}
              onSubmit={handleLogin}
            />
          )}

          {screen === "marcar" && validacion && (
            <MarcarScreen
              data={validacion}
              loading={loading}
              error={error}
              geoStatus={geoStatus}
              geoCoords={geoCoords}
              cameraActive={cameraActive}
              fotoBase64={fotoBase64}
              videoRef={videoRef}
              canvasRef={canvasRef}
              onRequestGeo={requestGeo}
              onStartCamera={startCamera}
              onCapturePhoto={capturePhoto}
              onMarcar={handleMarcar}
              onHistorial={handleHistorial}
              onLogout={() => {
                stopCamera();
                setScreen("login");
                setPin("");
                setValidacion(null);
                setGeoStatus("pending");
                setGeoCoords(null);
              }}
            />
          )}

          {screen === "confirmacion" && resultado && (
            <ConfirmacionScreen
              data={resultado}
              onNueva={handleNuevaMarcacion}
              onHistorial={handleHistorial}
            />
          )}

          {screen === "historial" && (
            <HistorialScreen
              items={historial}
              guardiaName={validacion?.guardiaName || ""}
              installationName={validacion?.installationName || ""}
              onBack={() => setScreen("marcar")}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-4">
          Registro conforme a Res. Exenta N°38 — DT Chile
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla: Login (RUT + PIN)
// ─────────────────────────────────────────────

function LoginScreen({
  rut,
  pin,
  loading,
  error,
  onRutChange,
  onPinChange,
  onSubmit,
}: {
  rut: string;
  pin: string;
  loading: boolean;
  error: string | null;
  onRutChange: (v: string) => void;
  onPinChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Identificación</h2>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            RUT
          </label>
          <input
            type="text"
            value={rut}
            onChange={(e) => onRutChange(e.target.value)}
            placeholder="12345678-9"
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg text-slate-900 placeholder:text-slate-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            inputMode="text"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            PIN
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => onPinChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••"
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg text-slate-900 placeholder:text-slate-400 bg-white text-center tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={loading || rut.length < 9 || pin.length < 4}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-base shadow-sm"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Shield className="w-5 h-5" />
              Ingresar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla: Marcar (Entrada/Salida)
// ─────────────────────────────────────────────

function MarcarScreen({
  data,
  loading,
  error,
  geoStatus,
  geoCoords,
  cameraActive,
  fotoBase64,
  videoRef,
  canvasRef,
  onRequestGeo,
  onStartCamera,
  onCapturePhoto,
  onMarcar,
  onHistorial,
  onLogout,
}: {
  data: ValidacionData;
  loading: boolean;
  error: string | null;
  geoStatus: "pending" | "granted" | "denied" | "error";
  geoCoords: { lat: number; lng: number } | null;
  cameraActive: boolean;
  fotoBase64: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onRequestGeo: () => void;
  onStartCamera: () => void;
  onCapturePhoto: () => void;
  onMarcar: (tipo: "entrada" | "salida") => void;
  onHistorial: () => void;
  onLogout: () => void;
}) {
  // Solicitar geo automáticamente al montar
  useEffect(() => {
    if (geoStatus === "pending") {
      onRequestGeo();
    }
  }, [geoStatus, onRequestGeo]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = now.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const geoReady = geoStatus === "granted" && geoCoords != null;
  const canMark = geoReady && !loading;

  return (
    <div className="p-6">
      {/* Info del guardia */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {data.guardiaName}
          </h2>
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {data.installationName}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Salir
        </button>
      </div>

      {/* Hora actual */}
      <div className="text-center py-6 bg-slate-50 rounded-xl mb-4">
        <p className="text-4xl font-bold text-slate-900 tabular-nums">
          {timeStr}
        </p>
        <p className="text-sm text-slate-500 mt-1 capitalize">{dateStr}</p>
      </div>

      {/* ── ESTADO DE GEOLOCALIZACIÓN (obligatorio) ── */}
      <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
        geoReady
          ? "bg-emerald-50 border border-emerald-200"
          : geoStatus === "denied" || geoStatus === "error"
          ? "bg-red-50 border border-red-200"
          : "bg-amber-50 border border-amber-200"
      }`}>
        {geoReady ? (
          <>
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">Ubicación verificada</p>
          </>
        ) : geoStatus === "pending" ? (
          <>
            <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
            <p className="text-sm text-amber-700">Obteniendo ubicación...</p>
          </>
        ) : (
          <>
            <MapPinOff className="w-4 h-4 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700 font-medium">Ubicación requerida</p>
              <p className="text-xs text-red-600 mt-0.5">
                Activa el GPS y permite el acceso a la ubicación en tu navegador.
              </p>
              <button
                onClick={onRequestGeo}
                className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
              >
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── CAPTURA DE FOTO (evidencia, no biométrica) ── */}
      <div className="mb-4">
        {!cameraActive && !fotoBase64 ? (
          <button
            onClick={onStartCamera}
            className="w-full flex items-center justify-center gap-2 p-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Tomar foto de evidencia
          </button>
        ) : cameraActive ? (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-h-48 mx-auto">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={onCapturePhoto}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Camera className="w-4 h-4" />
              Capturar
            </button>
          </div>
        ) : fotoBase64 ? (
          <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">Foto capturada</p>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Última marcación */}
      {data.ultimaMarcacion && (
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg mb-4">
          <Clock className="w-4 h-4 text-slate-400" />
          <p className="text-sm text-slate-600">
            Última: {data.ultimaMarcacion.tipo === "entrada" ? "Entrada" : "Salida"} a las{" "}
            {new Date(data.ultimaMarcacion.timestamp).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Botones de marcación */}
      <div className="space-y-3">
        {data.siguienteAccion === "entrada" ? (
          <button
            onClick={() => onMarcar("entrada")}
            disabled={!canMark}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <LogIn className="w-6 h-6" />
                Marcar Entrada
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => onMarcar("salida")}
            disabled={!canMark}
            className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <LogOut className="w-6 h-6" />
                Marcar Salida
              </>
            )}
          </button>
        )}

        {!geoReady && (
          <p className="text-center text-xs text-red-500">
            Debes activar tu ubicación para poder marcar
          </p>
        )}
      </div>

      {/* Historial */}
      <button
        onClick={onHistorial}
        disabled={loading}
        className="w-full mt-3 py-2 text-sm text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1"
      >
        <History className="w-4 h-4" />
        Ver mis marcaciones
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla: Confirmación
// ─────────────────────────────────────────────

function ConfirmacionScreen({
  data,
  onNueva,
  onHistorial,
}: {
  data: MarcacionResult;
  onNueva: () => void;
  onHistorial: () => void;
}) {
  const timeStr = new Date(data.timestamp).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="p-6 text-center">
      {/* Ícono de éxito */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
        <CheckCircle2 className="w-9 h-9 text-emerald-600" />
      </div>

      <h2 className="text-xl font-bold text-slate-900 mb-1">
        {data.tipo === "entrada" ? "Entrada Registrada" : "Salida Registrada"}
      </h2>
      {/* Intencional: display de hora en pantalla de confirmación, no es un KPI — no requiere KpiCard */}
      <p className="text-3xl font-bold text-slate-900 tabular-nums my-3">
        {timeStr}
      </p>
      <p className="text-sm text-slate-500 mb-4">{data.guardiaName}</p>

      {/* Estado geo */}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${
          data.geoValidada
            ? "bg-emerald-100 text-emerald-700"
            : data.geoDistanciaM != null
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {data.geoValidada ? (
          <>
            <MapPin className="w-4 h-4" />
            Ubicación validada
            {data.geoDistanciaM != null && ` (${data.geoDistanciaM}m)`}
          </>
        ) : data.geoDistanciaM != null ? (
          <>
            <AlertTriangle className="w-4 h-4" />
            Fuera de rango ({data.geoDistanciaM}m)
          </>
        ) : (
          <>
            <MapPin className="w-4 h-4" />
            Sin geolocalización
          </>
        )}
      </div>

      {/* Hash de integridad */}
      <div className="bg-slate-50 rounded-lg p-3 mb-4">
        <p className="text-xs text-slate-400 mb-1">Hash de integridad</p>
        <p className="text-xs font-mono text-slate-600 break-all">
          {data.hashIntegridad}
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={onNueva}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Nueva marcación
        </button>
        <button
          onClick={onHistorial}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1"
        >
          <History className="w-4 h-4" />
          Ver mis marcaciones
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla: Historial
// ─────────────────────────────────────────────

function HistorialScreen({
  items,
  guardiaName,
  installationName,
  onBack,
}: {
  items: HistorialItem[];
  guardiaName: string;
  installationName: string;
  onBack: () => void;
}) {
  // Agrupar por fecha
  const grouped: Record<string, HistorialItem[]> = {};
  for (const item of items) {
    const dateKey = new Date(item.timestamp).toLocaleDateString("es-CL", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  }

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Volver
      </button>

      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        Mis Marcaciones
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        {guardiaName} — {installationName}
      </p>

      {items.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">Sin marcaciones en los últimos 30 días</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {Object.entries(grouped).map(([date, marcaciones]) => (
            <div key={date}>
              <p className="text-xs font-medium text-slate-400 uppercase mb-2">
                {date}
              </p>
              <div className="space-y-1">
                {marcaciones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {m.tipo === "entrada" ? (
                        <LogIn className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <LogOut className="w-4 h-4 text-orange-500" />
                      )}
                      <span className="text-sm font-medium text-slate-700 capitalize">
                        {m.tipo}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.geoValidada ? (
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      ) : m.geoDistanciaM != null ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      ) : null}
                      <span className="text-sm text-slate-500 tabular-nums">
                        {new Date(m.timestamp).toLocaleTimeString("es-CL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
