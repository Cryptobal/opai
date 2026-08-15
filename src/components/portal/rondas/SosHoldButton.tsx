"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const SOS_HOLD_MS = 2000;

interface SosHoldButtonProps {
  onArmed: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * SOS compacto: hay que mantener 2s para armar el flujo de pánico.
 * Evita toques accidentales cerca del composer / bottom nav.
 */
export function SosHoldButton({ onArmed, disabled = false, className }: SosHoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const armedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startRef.current = null;
    armedRef.current = false;
    setHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    const next = Math.min(1, elapsed / SOS_HOLD_MS);
    setProgress(next);
    if (next >= 1) {
      if (!armedRef.current) {
        armedRef.current = true;
        if (navigator.vibrate) navigator.vibrate(40);
        onArmed();
      }
      clearHold();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [clearHold, onArmed]);

  const beginHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / browsers sin Pointer Capture
      }
      armedRef.current = false;
      startRef.current = performance.now();
      setHolding(true);
      setProgress(0);
      rafRef.current = requestAnimationFrame(tick);
    },
    [disabled, tick],
  );

  const endHold = useCallback(() => {
    if (armedRef.current) return;
    clearHold();
  }, [clearHold]);

  useEffect(() => () => clearHold(), [clearHold]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="SOS: mantener dos segundos para alerta de pánico"
      title="Mantener 2 segundos"
      onPointerDown={beginHold}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onLostPointerCapture={endHold}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "relative ml-auto inline-flex h-11 min-w-[4.75rem] select-none items-center justify-center gap-1.5 overflow-hidden rounded-full border border-status-danger-border bg-status-danger px-3 text-[12px] font-bold uppercase tracking-wide text-white touch-none",
        "shadow-[0_0_0_1px_hsl(var(--ds-danger)/0.35)] transition-transform active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-40",
        holding && "ring-2 ring-white/50",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-black/30"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
      <AlertTriangle className="relative h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="relative leading-none">{holding ? "…" : "SOS"}</span>
    </button>
  );
}
