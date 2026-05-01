// @ds-allow-legacy
// PanicoModal intencionalmente usa rojos hex (red-900, red-700, red-200, etc.)
// porque es la alarma operativa de máxima urgencia que activa el guardia.
// Migrar a status-danger-soft reduciría el efecto visual de alarma.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

interface PanicoModalProps {
  session: RondasSession;
  activeEjecucionId?: string | null;
  onClose: () => void;
  onPanicSent: () => void;
}

export function PanicoModal({ session, activeEjecucionId, onClose, onPanicSent }: PanicoModalProps) {
  const [countdown, setCountdown] = useState(5);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleConfirm = useCallback(async () => {
    if (countdown > 0 || sending) return;
    setSending(true);
    setError(null);

    // Try to get GPS (non-blocking)
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 30000,
        });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // GPS failed — send without coordinates
    }

    try {
      const res = await fetch("/api/portal/rondas/panico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          tenantId: session.tenantId,
          lat,
          lng,
          ejecucionId: activeEjecucionId || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error al enviar alerta");
      }

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(1000);

      setSent(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onPanicSent();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar alerta");
      setSending(false);
    }
  }, [countdown, sending, session, activeEjecucionId, onPanicSent]);

  // 3-second countdown
  useEffect(() => {
    if (countdown <= 0) return;
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send when countdown reaches 0 (no manual confirm needed)
  useEffect(() => {
    if (countdown === 0 && !sending && !sent) {
      handleConfirm();
    }
  }, [countdown, sending, sent, handleConfirm]);

  // Success state
  if (sent) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-red-950/95 backdrop-blur-sm">
        <div className="mx-4 text-center">
          <div className="mb-4 text-6xl">&#x2705;</div>
          <h2 className="mb-2 text-2xl font-bold text-white">Alerta enviada</h2>
          <p className="text-red-200">Central de monitoreo ha sido notificada.</p>
        </div>
      </div>
    );
  }

  const progressPercent = ((5 - countdown) / 5) * 100;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-2 text-status-danger-fg hover:bg-red-900/50"
        aria-label="Cancelar"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="mx-4 w-full max-w-sm space-y-8 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-900/60 ring-4 ring-red-500/30">
            <AlertTriangle className="h-12 w-12 text-status-danger-fg" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-white">ALERTA DE PANICO</h1>
          <p className="mt-2 text-red-200">
            Se notificara a central de monitoreo inmediatamente
          </p>
        </div>

        {/* Cancel button */}
        <button
          onClick={onClose}
          disabled={sending}
          className="w-full rounded-xl border border-red-700/50 bg-red-900/30 py-3.5 text-base font-medium text-status-danger-fg transition-colors hover:bg-red-900/50 disabled:opacity-40"
        >
          Cancelar
        </button>

        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-red-900/50">
          <div
            className="h-full rounded-full bg-status-danger transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Status text — auto-sends when countdown reaches 0 */}
        <div
          className={`w-full rounded-xl py-4 text-lg font-bold text-white text-center transition-all ${
            countdown > 0
              ? "bg-red-900/40 opacity-50"
              : "bg-red-700 opacity-70 animate-pulse"
          }`}
        >
          {sending
            ? "Enviando alerta..."
            : countdown > 0
              ? `Enviando en ${countdown}s...`
              : "Preparando envio..."}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-status-danger-fg">{error}</p>
        )}
      </div>
    </div>
  );
}
