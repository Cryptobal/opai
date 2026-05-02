"use client";

import { useState, useEffect, useCallback } from "react";
import { PhotoCapture } from "./PhotoCapture";
import type { RondasSession } from "./RondasPortalClient";

interface Props {
  session: RondasSession;
  activeEjecucionId?: string;
  activeCheckpointId?: string;
  activeCheckpointName?: string;
  checkpoints?: { id: string; name: string }[];
  onClose: () => void;
  onSubmitted: () => void;
  /** Cuando true, se renderiza como pantalla (no modal): sin overlay, barra abajo usable */
  asScreen?: boolean;
}

const INCIDENT_TYPES = [
  { id: "incendio", label: "Incendio", icon: "\u{1F525}" },
  { id: "fuga_agua", label: "Fuga de agua", icon: "\u{1F4A7}" },
  { id: "acceso_forzado", label: "Acceso forzado", icon: "\u{1F6AA}" },
  { id: "persona_sospechosa", label: "Persona sospechosa", icon: "\u{1F464}" },
  { id: "falla_electrica", label: "Falla el\u00e9ctrica", icon: "\u{1F4A1}" },
  { id: "otro", label: "Otro", icon: "\u26A0\uFE0F" },
] as const;

type IncidentType = (typeof INCIDENT_TYPES)[number]["id"];

export function ReportarIncidente({
  session,
  activeEjecucionId,
  activeCheckpointId,
  activeCheckpointName,
  checkpoints,
  onClose,
  onSubmitted,
  asScreen = false,
}: Props) {
  const [tipo, setTipo] = useState<IncidentType | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    activeCheckpointId ?? ""
  );
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"loading" | "ok" | "error">(
    "loading"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [offlineMsg, setOfflineMsg] = useState("");

  // Auto-capture GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("ok");
      },
      () => {
        setGpsStatus("error");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // Clean up photo preview URL on unmount
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const handlePhotoCapture = useCallback((blob: Blob) => {
    setPhotoBlob(blob);
    setPhotoPreview(URL.createObjectURL(blob));
    setShowCamera(false);
  }, []);

  const canSubmit = tipo && descripcion.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!tipo || !descripcion.trim()) return;
    setSubmitting(true);
    setError("");
    setOfflineMsg("");

    try {
      // 1. Upload photo if present
      let fotoUrl: string | undefined;
      if (photoBlob) {
        const formData = new FormData();
        formData.append("file", photoBlob, "incidente.jpg");
        formData.append("guardiaId", session.guardiaId);
        const uploadRes = await fetch("/api/portal/rondas/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          fotoUrl = uploadData.data.url;
        }
      }

      // 2. Submit incident
      const payload = {
        tenantId: session.tenantId,
        guardiaId: session.guardiaId,
        installationId: session.installationId,
        ejecucionId: activeEjecucionId || undefined,
        checkpointId: selectedCheckpointId || undefined,
        tipo,
        descripcion: descripcion.trim(),
        fotoUrl,
        lat: gps?.lat,
        lng: gps?.lng,
      };

      const res = await fetch("/api/portal/rondas/incidente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Error al enviar reporte");
        setSubmitting(false);
        return;
      }

      onSubmitted();
    } catch (err) {
      // Offline support: save to localStorage if network error
      if (err instanceof TypeError) {
        const pending = JSON.parse(
          localStorage.getItem("pending-incidents") || "[]"
        ) as unknown[];
        pending.push({
          tenantId: session.tenantId,
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          ejecucionId: activeEjecucionId || undefined,
          checkpointId: selectedCheckpointId || undefined,
          tipo,
          descripcion: descripcion.trim(),
          lat: gps?.lat,
          lng: gps?.lng,
          savedAt: new Date().toISOString(),
        });
        localStorage.setItem("pending-incidents", JSON.stringify(pending));
        setOfflineMsg(
          "Incidente guardado. Se enviar\u00e1 cuando haya conexi\u00f3n."
        );
        setSubmitting(false);
        return;
      }
      setError("Error inesperado al enviar reporte");
      setSubmitting(false);
    }
  }, [
    tipo,
    descripcion,
    photoBlob,
    session,
    activeEjecucionId,
    selectedCheckpointId,
    gps,
    onSubmitted,
  ]);

  if (showCamera) {
    return (
      <PhotoCapture
        onCapture={handlePhotoCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  const rootClassName = asScreen
    ? "flex-1 flex flex-col min-h-0 bg-[#0A0F1C]"
    : "fixed inset-0 z-[60] flex flex-col bg-black/90";

  return (
    <div className={rootClassName}>
      {/* Sticky header */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-xl font-bold text-white">
          {"\u{1F6A8}"} Reportar Incidente
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg bg-zinc-800 p-2 text-gray-400 hover:bg-zinc-700 hover:text-white"
          aria-label={asScreen ? "Volver" : "Cerrar"}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
        <div className="mx-auto w-full max-w-md space-y-5">

        {/* Incident type grid */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">
            Tipo de incidente
          </label>
          <div className="grid grid-cols-3 gap-2">
            {INCIDENT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center transition-colors ${
                  tipo === t.id
                    ? "border-status-info bg-status-info-soft text-white"
                    : "border-zinc-700 bg-zinc-800 text-gray-400 hover:border-zinc-600"
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Photo section */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">
            Foto (opcional)
          </label>
          {photoPreview ? (
            <div className="space-y-2">
              <img
                src={photoPreview}
                alt="Foto del incidente"
                className="h-32 w-full rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 text-sm text-gray-200 hover:bg-zinc-700"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex w-full min-h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-800 py-3 text-sm text-gray-400 hover:border-zinc-600 hover:text-gray-200"
            >
              <svg
                className="h-5 w-5"
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
              Agregar Foto
            </button>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">
            Descripci&oacute;n <span className="text-status-danger-fg">*</span>
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            required
            placeholder="Describe el incidente..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-gray-500 focus:border-status-info-border focus:outline-none focus:ring-1 focus:ring-status-info-border"
          />
          <p className="mt-1 text-right text-xs text-gray-500">
            {descripcion.length}/500
          </p>
        </div>

        {/* GPS status */}
        <div className="text-sm">
          {gpsStatus === "ok" ? (
            <p className="text-status-ok-fg">
              {"\u{1F4CD}"} Ubicaci&oacute;n capturada {"\u2705"}
            </p>
          ) : gpsStatus === "loading" ? (
            <p className="text-gray-400">
              {"\u{1F4CD}"} Obteniendo ubicaci&oacute;n...
            </p>
          ) : (
            <p className="text-status-warn-fg">
              {"\u{1F4CD}"} No se pudo obtener ubicaci&oacute;n
            </p>
          )}
        </div>

        {/* Checkpoint link */}
        {checkpoints && checkpoints.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-200">
              Checkpoint asociado
            </label>
            <select
              value={selectedCheckpointId}
              onChange={(e) => setSelectedCheckpointId(e.target.value)}
              className="w-full min-h-14 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-status-info-border focus:outline-none focus:ring-1 focus:ring-status-info-border"
            >
              <option value="">Sin checkpoint</option>
              {checkpoints.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-status-danger-soft border border-status-danger-border px-4 py-3 text-sm text-status-danger-fg">
            {error}
          </div>
        )}

        {/* Offline message */}
        {offlineMsg && (
          <div className="rounded-lg bg-status-warn-soft border border-status-warn-border px-4 py-3 text-sm text-status-warn-fg">
            {offlineMsg}
          </div>
        )}

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex w-full min-h-14 items-center justify-center gap-2 rounded-xl bg-status-info py-3 text-lg font-semibold text-white transition-colors hover:bg-status-info disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <>
              {"\u{1F6A8}"} Enviar Reporte
            </>
          )}
        </button>
        </div>
      </div>
    </div>
  );
}
