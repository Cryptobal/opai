"use client";

import { useState, useEffect, useRef } from "react";
import { XlButton } from "@/components/opai/terreno";

export interface ActiveCheckpoint {
  id: string;
  name: string;
  orderIndex: number;
  isRequired: boolean;
  distanceM: number | null;
  geoRadiusM: number;
  qrRequired: boolean;
  verificationType: string;
  isInRadius: boolean;
  geoPendingValidation?: boolean;
}

interface Props {
  checkpoint: ActiveCheckpoint | null;
  allCompleted: boolean;
  completedCount: number;
  total: number;
  isMarking: boolean;
  onConfirmMark: () => void;
  transitionState: "idle" | "out" | "in";
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function distanceTone(meters: number | null): string {
  if (meters == null) return "text-ds-text-3 border-ds-border-default";
  if (meters <= 10) return "text-status-ok-fg border-status-ok";
  if (meters <= 50) return "text-primary border-primary";
  return "text-ds-text-3 border-ds-border-default";
}

export function ActiveCheckpointCard({
  checkpoint,
  allCompleted,
  completedCount,
  total,
  isMarking,
  onConfirmMark,
  transitionState,
}: Props) {
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (transitionState === "out") {
      setShowToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 2000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [transitionState]);

  const cardClass =
    transitionState === "out"
      ? "animate-slideDown opacity-0"
      : transitionState === "in"
        ? "animate-slideUp"
        : "";

  if (allCompleted) {
    return (
      <div className="mx-2 mb-2">
        <div className="rounded-2xl border border-status-ok-border bg-status-ok-soft/30 p-5 text-center">
          <h3 className="font-display text-base font-bold text-status-ok-fg">Ronda completada</h3>
          <p className="mt-1 text-[12px] text-ds-text-3">
            Todos los puntos marcados ({completedCount}/{total})
          </p>
        </div>
      </div>
    );
  }

  if (!checkpoint) return null;

  if (checkpoint.geoPendingValidation) {
    return (
      <div className="mx-2 mb-2">
        <div className="rounded-2xl border border-status-warn-border bg-status-warn-soft/40 p-4">
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-status-warn-fg">
            Ubicación sin confirmar
          </p>
          <p className="mt-1 font-display text-[19px] font-semibold leading-tight text-ds-text-1">
            {checkpoint.name}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ds-text-3">
            Tu marcación quedó registrada. Un supervisor puede revisarla (GPS dudoso o fuera del radio).
          </p>
          <XlButton
            className="mt-3"
            variant="dark"
            size="md"
            disabled={isMarking}
            onClick={onConfirmMark}
          >
            {isMarking ? "Reintentando..." : "Reintentar marcación"}
          </XlButton>
        </div>
      </div>
    );
  }

  const qrIsProof =
    checkpoint.verificationType === "QR" || checkpoint.verificationType === "BOTH";
  const canMark = qrIsProof || checkpoint.isInRadius;
  const isOutsideGeofence = !qrIsProof && !checkpoint.isInRadius;
  const distClass = distanceTone(checkpoint.distanceM);

  const ctaLabel = isMarking
    ? "Marcando..."
    : qrIsProof
      ? "ESCANEAR QR"
      : isOutsideGeofence
        ? "Marcar fuera de rango"
        : canMark
          ? "Confirmar marcación"
          : `Acércate al punto (radio: ${checkpoint.geoRadiusM}m)`;

  return (
    <>
      {showToast && (
        <div className="fixed left-4 right-4 top-20 z-50 flex items-center justify-center motion-safe:animate-in motion-safe:slide-in-from-top">
          <div className="flex items-center gap-2 rounded-xl bg-status-ok px-4 py-2.5 shadow-lg">
            <span className="text-sm font-semibold text-white">Punto marcado exitosamente</span>
          </div>
        </div>
      )}

      <div className={`mx-2 mb-2 ${cardClass}`}>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-primary">
            Siguiente checkpoint
          </p>
          <p className="mt-1 font-display text-[19px] font-semibold leading-tight text-ds-text-1">
            {checkpoint.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {checkpoint.distanceM != null && (
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[12px] font-semibold ${distClass}`}>
                {formatDistance(checkpoint.distanceM)}
              </span>
            )}
            {checkpoint.isRequired && (
              <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-[12px] font-semibold text-status-warn-fg">
                Obligatorio
              </span>
            )}
            {checkpoint.qrRequired && (
              <span className="rounded-full bg-ds-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ds-text-2">
                QR
              </span>
            )}
          </div>
          <XlButton
            className="mt-3"
            size="md"
            variant={isOutsideGeofence ? "dark" : "teal"}
            disabled={isMarking || (!canMark && !isOutsideGeofence)}
            onClick={onConfirmMark}
          >
            {ctaLabel}
          </XlButton>
          {isOutsideGeofence && !isMarking && (
            <p className="mt-1.5 text-center text-[12px] text-status-warn-fg">
              Fuera del radio — se pedirá confirmación al marcar
            </p>
          )}
        </div>
      </div>
    </>
  );
}
