"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { FaceCameraCapture } from "./FaceCameraCapture";
import { FaceRegistrationFlow } from "./FaceRegistrationFlow";
import { MarcacionOfflineQueue } from "./MarcacionOfflineQueue";
import {
  ResultMetaChip,
  ResultScreen,
  TruthBar,
  XlButton,
  type GpsChipStatus,
} from "@/components/opai/terreno";

interface MarcacionScreenProps {
  deviceToken: string;
  installationId: string;
  installationName: string;
  isOnline: boolean;
}

/**
 * Shell estable a nivel de módulo. Si se define dentro de MarcacionScreen,
 * cada tick del reloj (o cualquier setState) crea un tipo de componente nuevo,
 * React remonta el árbol y el teclado móvil cierra el input de RUT/PIN.
 */
function MarcacionShell({
  children,
  gpsStatus,
  gpsAccuracyM,
  online,
  queueCount,
}: {
  children: ReactNode;
  gpsStatus: GpsChipStatus;
  gpsAccuracyM?: number | null;
  online: boolean;
  queueCount: number;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TruthBar
        gpsStatus={gpsStatus}
        gpsAccuracyM={gpsAccuracyM}
        online={online}
        queueCount={queueCount}
      />
      {children}
    </div>
  );
}

function GpsDeniedModal({
  open,
  message,
  onRetry,
  onContinueWithoutGps,
}: {
  open: boolean;
  message: string | null;
  onRetry: () => void;
  onContinueWithoutGps: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="max-w-sm rounded-2xl border border-status-warn-border bg-ds-surface-1 p-6 text-center">
        <p className="mb-2 text-lg font-semibold text-ds-text-1">
          No se pudo obtener tu ubicación
        </p>
        <p className="mb-6 text-sm text-ds-text-3">
          Puedes reintentar o marcar sin ubicación. La marca queda registrada
          como sin GPS y se notifica al supervisor.
        </p>
        {message && <p className="mb-4 text-[12px] text-status-danger-fg">{message}</p>}
        <div className="space-y-3">
          <XlButton variant="teal" size="md" onClick={onRetry}>
            Reintentar
          </XlButton>
          <button
            type="button"
            onClick={onContinueWithoutGps}
            className="inline-flex min-h-11 w-full items-center justify-center text-sm text-ds-text-2 underline"
          >
            Marcar sin ubicación
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reloj en componente hijo: el tick no remonta el formulario de RUT. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const clockParts = new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = clockParts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = clockParts.find((p) => p.type === "minute")?.value ?? "00";
  const second = clockParts.find((p) => p.type === "second")?.value ?? "00";
  const dateStr = now
    .toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  return (
    <>
      <p className="text-center font-mono text-[12px] font-medium uppercase tracking-[0.18em] text-ds-text-3">
        {dateStr}
      </p>
      <p
        className="mt-1 text-center font-mono font-bold tabular-nums leading-none text-ds-text-1"
        style={{ fontSize: "clamp(56px, 17vw, 72px)" }}
      >
        {hour}:{minute}
        <span className="text-ds-text-3">:{second}</span>
      </p>
    </>
  );
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
  gpsStatus?: "dentro_rango" | "fuera_rango" | "sin_gps";
  geoDistanciaM?: number | null;
}

type ScreenMode =
  | "rut-entry"       // Step 1: enter RUT
  | "face-verify"     // Step 2: face verification
  | "pin-fallback"    // Fallback: PIN entry
  | "face-register"   // Register face ID for first time
  | "processing"
  | "success"
  | "error";

type GpsStatus = "idle" | "loading" | "ok" | "error";

const GPS_TIMEOUT_MS = 60000;
const GPS_RETRY_DELAY_MS = 2000;
const GPS_MAX_RETRIES = 1;

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

function getGpsErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Permiso de ubicación denegado. Actívalo en Configuración.";
    case 2:
      return "GPS no disponible. Verifica que la ubicación esté activada.";
    case 3:
      return "La obtención de ubicación tardó demasiado. Reintentando...";
    default:
      return "Error al obtener ubicación. Reintentando...";
  }
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
  const [queueCount, setQueueCount] = useState(0);

  // PIN fallback state
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinFallbackReason, setPinFallbackReason] = useState<string>("user_choice");

  // GPS obligatorio — se solicita al entrar a face-verify o pin-fallback, no al montar
  const [geoPosition, setGeoPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showGpsModal, setShowGpsModal] = useState(false);
  const [allowWithoutGps, setAllowWithoutGps] = useState(false);

  const rutInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      MarcacionOfflineQueue.count().then((n) => {
        if (mounted) setQueueCount(n);
      });
    };
    refresh();
    const unsub = MarcacionOfflineQueue.subscribe(refresh);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Solicitar GPS con reintentos automáticos (3 intentos, 2s entre cada uno)
  const requestGps = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (!("geolocation" in navigator)) {
      setGpsError("Tu dispositivo no soporta geolocalización.");
      setGpsStatus("error");
      return Promise.resolve(null);
    }

    const tryGetPosition = (attempt: number): Promise<{ lat: number; lng: number } | null> =>
      new Promise((resolve) => {
        setGpsStatus("loading");
        setGpsError(null);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setGeoPosition(coords);
            setGpsAccuracyM(
              typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
            );
            setGpsStatus("ok");
            setGpsError(null);
            resolve(coords);
          },
          (err) => {
            const msg = getGpsErrorMessage(err.code);
            setGpsError(msg);

            if (attempt < GPS_MAX_RETRIES) {
              // Reintentar después de 2 segundos
              setTimeout(() => {
                tryGetPosition(attempt + 1).then(resolve);
              }, GPS_RETRY_DELAY_MS);
            } else {
              setGpsStatus("error");
              setShowGpsModal(true);
              resolve(null);
            }
          },
          { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 }
        );
      });

    return tryGetPosition(1);
  }, []);

  // Solicitar GPS al entrar a face-verify o pin-fallback (no al montar del componente)
  // Si ya tenemos coords (ej. al cambiar de face-verify a pin-fallback), mantenerlos
  const prevModeRef = useRef<ScreenMode>("rut-entry");
  useEffect(() => {
    if (mode === "face-verify" || mode === "pin-fallback") {
      const comingFromOtherMarkScreen =
        prevModeRef.current === "face-verify" || prevModeRef.current === "pin-fallback";
      prevModeRef.current = mode;

      if (comingFromOtherMarkScreen && geoPosition) {
        setGpsStatus("ok");
        setGpsError(null);
        setShowGpsModal(false);
      } else {
        setGeoPosition(null);
        setGpsAccuracyM(null);
        setGpsStatus("idle");
        setGpsError(null);
        setShowGpsModal(false);
        requestGps();
      }
    } else {
      prevModeRef.current = mode;
    }
  }, [mode, requestGps]);

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

  // Focus RUT only when entering the step (kiosk). Do not re-focus on every
  // parent re-render — that fights the soft keyboard on mobile Safari.
  useEffect(() => {
    if (mode !== "rut-entry") return;
    const id = window.setTimeout(() => {
      const el = rutInputRef.current;
      if (el && document.activeElement !== el) el.focus();
    }, 100);
    return () => window.clearTimeout(id);
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
  // GPS obligatorio: el botón de capturar está deshabilitado hasta tener coordenadas
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
            deviceToken,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // CRITICAL: Only offer enrollment when guard has NO Face ID registered.
          if (
            res.status === 404 &&
            data.code === "FACE_NOT_REGISTERED" &&
            !guardiaInfo.faceIdRegistered
          ) {
            setMode("face-register");
            return;
          }
          setPinFallbackReason(data.code === "FACE_MISMATCH" ? "face_mismatch" : "aws_error");
          throw new Error(data.error || "No se pudo verificar el rostro");
        }

        setLastMarca({
          guardiaName: data.data.guardiaName,
          tipo: data.data.tipo as MarcaTipo,
          timestamp: data.data.timestamp,
          hashIntegridad: data.data.hashIntegridad,
          faceConfidence: data.data.faceConfidence,
          gpsStatus: data.data.gpsStatus,
          geoDistanciaM: data.data.geoDistanciaM,
        });
        setMode("success");
      } catch (err) {
        if (!isOnline) {
          // Offline: solo permitir si tenemos GPS (obligatorio)
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
        setMode("face-verify");
      }
    },
    [guardiaInfo, installationId, geoPosition, isOnline, deviceToken]
  );

  // ── PIN fallback submission ─────────────────────────────────────────────
  // GPS obligatorio: el botón está deshabilitado hasta tener coordenadas
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
            lat: geoPosition?.lat ?? null,
            lng: geoPosition?.lng ?? null,
            pinFallbackReason,
            deviceToken,
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
          gpsStatus: data.data.gpsStatus,
          geoDistanciaM: data.data.geoDistanciaM,
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

  const truthGps = ((): { status: GpsChipStatus; meters?: number | null } => {
    if (mode !== "face-verify" && mode !== "pin-fallback") {
      return { status: "off" };
    }
    if (gpsStatus === "ok") return { status: "ok", meters: gpsAccuracyM };
    if (gpsStatus === "error") return { status: "off" };
    return { status: "warn" };
  })();

  function resetToHome() {
    setMode("rut-entry");
    setRutInput("");
    setGuardiaInfo(null);
    setError(null);
    setPin("");
  }

  const shellProps = {
    gpsStatus: truthGps.status,
    gpsAccuracyM: truthGps.meters,
    online: isOnline,
    queueCount,
  } as const;

  const gpsModal = (
    <GpsDeniedModal
      open={showGpsModal}
      message={gpsError}
      onRetry={() => {
        setShowGpsModal(false);
        setGpsStatus("idle");
        requestGps();
      }}
      onContinueWithoutGps={() => {
        setAllowWithoutGps(true);
        setShowGpsModal(false);
        setGpsStatus("error");
      }}
    />
  );

  // ── Face registration flow ──────────────────────────────────────────────
  if (mode === "face-register" && guardiaInfo) {
    return (
      <MarcacionShell {...shellProps}>
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
      </MarcacionShell>
    );
  }

  // ── Processing spinner ──────────────────────────────────────────────────
  if (mode === "processing") {
    return (
      <MarcacionShell {...shellProps}>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-ds-border-default border-t-primary" />
            <p className="mt-4 text-ds-text-2">Verificando identidad...</p>
          </div>
        </div>
      </MarcacionShell>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (mode === "success" && lastMarca) {
    const fuera = lastMarca.gpsStatus === "fuera_rango";
    const dist =
      lastMarca.geoDistanciaM != null && Number.isFinite(lastMarca.geoDistanciaM)
        ? Math.round(lastMarca.geoDistanciaM)
        : null;
    const tone = fuera ? "warn" : "ok";
    const gpsChip =
      lastMarca.gpsStatus === "fuera_rango"
        ? `GPS fuera de rango${dist != null ? ` · ${dist}m` : ""}`
        : lastMarca.gpsStatus === "sin_gps"
          ? "Sin GPS"
          : `GPS dentro de rango${dist != null ? ` · ${dist}m` : ""}`;

    return (
      <MarcacionShell {...shellProps}>
        <ResultScreen
          tone={tone}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          }
          title={`${lastMarca.tipo === "entrada" ? "ENTRADA" : "SALIDA"} REGISTRADA`}
          who={lastMarca.guardiaName}
          stamp={formatStamp(lastMarca.timestamp)}
          meta={
            <>
              {lastMarca.faceConfidence != null && (
                <ResultMetaChip tone="ok">
                  Identidad confirmada · {lastMarca.faceConfidence.toFixed(0)}%
                </ResultMetaChip>
              )}
              {lastMarca.gpsStatus && (
                <ResultMetaChip tone={fuera ? "warn" : "ok"}>{gpsChip}</ResultMetaChip>
              )}
              {lastMarca.offline && (
                <ResultMetaChip tone="warn">GUARDADA SIN CONEXIÓN</ResultMetaChip>
              )}
            </>
          }
          footer={
            fuera ? (
              <p className="text-center text-sm font-medium text-white">Quedará observada</p>
            ) : (
              <p className="text-center text-xs text-white">Vuelve a pantalla principal en 5s</p>
            )
          }
        />
      </MarcacionShell>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────
  if (mode === "error") {
    return (
      <MarcacionShell {...shellProps}>
        <ResultScreen
          tone="bad"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
          title="MARCA NO REGISTRADA"
          who={error}
          footer={
            <XlButton variant="ghost" size="md" onClick={resetToHome}>
              Reintentar
            </XlButton>
          }
        />
      </MarcacionShell>
    );
  }

  // ── Step 1: RUT entry ───────────────────────────────────────────────────
  if (mode === "rut-entry") {
    return (
      <MarcacionShell {...shellProps}>
        <div className="flex flex-1 flex-col justify-center px-4 pb-8">
          <LiveClock />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ds-text-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {installationName}
          </p>

          <form onSubmit={handleRutSubmit} className="mt-10 space-y-4">
            <div>
              <label className="mb-2 block text-center font-mono text-[12px] uppercase tracking-widest text-ds-text-3">
                RUT
              </label>
              <input
                ref={rutInputRef}
                type="text"
                value={rutInput}
                onChange={(e) => {
                  setRutInput(formatRutInput(e.target.value));
                }}
                placeholder="12.345.678-K"
                className="h-12 w-full rounded-2xl border border-ds-border-default bg-ds-surface-2 px-5 text-center font-mono text-xl tracking-widest text-ds-text-1 outline-none placeholder:text-ds-text-4 focus-visible:ring-2 focus-visible:ring-primary"
                inputMode="text"
                pattern="[0-9kK.\-]*"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {error && (
              <p className="text-center text-sm text-status-danger-fg">{error}</p>
            )}

            <XlButton
              type="submit"
              variant="teal"
              size="lg"
              disabled={!rutInput.trim() || lookupLoading}
              className="min-h-[80px]"
            >
              {lookupLoading ? "Buscando..." : "Continuar"}
            </XlButton>
          </form>

          {lastMarca && (
            <div className="mt-8 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3 text-center">
              <p className="text-[12px] uppercase tracking-wide text-ds-text-3">Última marca de esta sesión</p>
              <p className="mt-1 text-sm text-ds-text-2">
                {lastMarca.guardiaName} — {lastMarca.tipo === "entrada" ? "Entrada" : "Salida"}{" "}
                {formatStamp(lastMarca.timestamp)}
              </p>
            </div>
          )}
        </div>
      </MarcacionShell>
    );
  }

  // ── Step 2: Face verify (or no face ID registered) ──────────────────────
  if (mode === "face-verify" && guardiaInfo) {
    const tipo = guardiaInfo.nextTipo;
    const gpsReady = (gpsStatus === "ok" && geoPosition != null) || allowWithoutGps;

    return (
      <MarcacionShell {...shellProps}>
        {gpsModal}
        <div className="flex flex-1 flex-col px-4 pb-6">
          <div className="my-4 flex items-center gap-3">
            {guardiaInfo.photoUrl ? (
              <img
                src={guardiaInfo.photoUrl}
                alt={guardiaInfo.name}
                className="h-14 w-14 rounded-full object-cover border-2 border-primary"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-ds-surface-2 text-2xl font-bold text-ds-text-2">
                {guardiaInfo.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm text-ds-text-3">Hola,</p>
              <p className="text-lg font-bold text-ds-text-1">{guardiaInfo.name}</p>
              <p className={`text-sm font-semibold ${tipo === "entrada" ? "text-status-ok-fg" : "text-ds-text-2"}`}>
                Tu siguiente marca: {tipo === "entrada" ? "ENTRADA" : "SALIDA"}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-status-danger-border bg-status-danger-soft p-3 text-center text-sm text-status-danger-fg">
              {error}
            </div>
          )}

          {guardiaInfo.faceIdRegistered ? (
            <div className="flex flex-1 flex-col">
              <FaceCameraCapture
                onCapture={handleFaceCapture}
                onCancel={() => {
                  setMode("rut-entry");
                  setGuardiaInfo(null);
                  setError(null);
                }}
                captureLabel={
                  gpsReady
                    ? tipo === "entrada"
                      ? "ENTRADA"
                      : "SALIDA"
                    : "Buscando ubicación… (hasta 60 s)"
                }
                captureVariant={tipo === "entrada" ? "teal" : "dark"}
                captureDisabled={!gpsReady}
              />
              {!gpsReady && (
                <button
                  type="button"
                  onClick={() => setAllowWithoutGps(true)}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm text-ds-text-2 underline"
                >
                  Marcar sin ubicación
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-ds-border-default bg-ds-surface-2 p-6 text-center">
              <p className="mb-2 font-semibold text-ds-text-1">No tienes Face ID activado</p>
              <p className="mb-6 text-sm text-ds-text-3">
                Registra tu rostro para poder marcar con Face ID
              </p>
              <XlButton variant="teal" size="md" onClick={() => setMode("face-register")}>
                Registrar Face ID ahora
              </XlButton>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setPinFallbackReason("user_choice");
                setMode("pin-fallback");
              }}
              className="inline-flex min-h-11 items-center px-3 text-sm text-ds-text-3 underline underline-offset-2"
            >
              ¿Problemas con la cámara? Usar PIN
            </button>
          </div>
        </div>
      </MarcacionShell>
    );
  }

  // ── PIN fallback ────────────────────────────────────────────────────────
  if (mode === "pin-fallback" && guardiaInfo) {
    const tipo = guardiaInfo.nextTipo;
    const gpsReady = (gpsStatus === "ok" && geoPosition != null) || allowWithoutGps;

    return (
      <MarcacionShell {...shellProps}>
        {gpsModal}
        <div className="flex flex-1 flex-col justify-center px-4 pb-8">
          <div className="mb-6 rounded-xl border border-status-warn-border bg-status-warn-soft p-3 text-center">
            <p className="text-sm font-medium text-status-warn-fg">
              Marcación con PIN — requiere validación del supervisor
            </p>
          </div>

          <div className="mb-6 text-center">
            <p className="text-lg font-bold text-ds-text-1">{guardiaInfo.name}</p>
            <p className={`text-sm font-semibold ${tipo === "entrada" ? "text-status-ok-fg" : "text-ds-text-2"}`}>
              {tipo === "entrada" ? "ENTRADA" : "SALIDA"}
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-center font-mono text-[12px] uppercase tracking-widest text-ds-text-3">
                PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                maxLength={6}
                className="h-12 w-full rounded-2xl border border-ds-border-default bg-ds-surface-2 px-5 text-center font-mono text-[2rem] tracking-[0.5rem] text-ds-text-1 outline-none placeholder:text-ds-text-4 focus-visible:ring-2 focus-visible:ring-primary"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-center text-sm text-status-danger-fg">{error}</p>
            )}

            <XlButton
              type="submit"
              variant={tipo === "entrada" ? "teal" : "dark"}
              size="xl"
              disabled={!pin || pinLoading || !gpsReady}
              className="min-h-[88px] sm:min-h-[96px]"
            >
              {pinLoading
                ? "Registrando..."
                : !gpsReady
                  ? "Buscando ubicación… (hasta 60 s)"
                  : tipo === "entrada"
                    ? "ENTRADA"
                    : "SALIDA"}
            </XlButton>
          </form>

          {!gpsReady && (
            <button
              type="button"
              onClick={() => setAllowWithoutGps(true)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm text-ds-text-2 underline"
            >
              Marcar sin ubicación
            </button>
          )}

          <button
            type="button"
            onClick={() => setMode("face-verify")}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center text-sm text-ds-text-3"
          >
            Volver a Face ID
          </button>
        </div>
      </MarcacionShell>
    );
  }

  // Fallback (should not reach)
  return null;
}
