"use client";

import { useCallback, useEffect, useState } from "react";
import { dismissUndo, type UndoSnackbarState } from "@/components/opai-ds";

/**
 * Estado de deshacer renderizado DENTRO de la isla móvil (mismo store global
 * que el snackbar). La isla reclama el host del undo mientras el lector está
 * montado, así el snackbar global no se dibuja sobre la barra inferior.
 */
export function CorreoIslandUndoBar({ payload }: { payload: UndoSnackbarState }) {
  const [progress, setProgress] = useState(1);
  const [busy, setBusy] = useState(false);

  const close = useCallback(
    (opts?: { silent?: boolean }) => dismissUndo(payload.id, opts),
    [payload.id],
  );

  // Reinicia la animación con cada `payload` (createdAt) — dos acciones
  // seguidas reemplazan el estado y la barra vuelve a llenarse.
  useEffect(() => {
    const started = payload.createdAt;
    const total = payload.durationMs;
    let raf = 0;
    const tick = () => {
      const left = 1 - (Date.now() - started) / total;
      if (left <= 0) {
        setProgress(0);
        close();
        return;
      }
      setProgress(left);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [payload.createdAt, payload.durationMs, close]);

  const onUndo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await payload.onUndo();
    } finally {
      close({ silent: true });
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="opai-glass-strong opai-glass-shell relative flex h-[60px] items-center gap-3 overflow-hidden rounded-[26px] px-5"
    >
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
        {payload.message}
      </p>
      <button
        type="button"
        onClick={() => void onUndo()}
        disabled={busy}
        className="min-h-11 min-w-[72px] shrink-0 px-1 text-[13px] font-semibold text-primary ds-tap disabled:opacity-60"
      >
        {payload.actionLabel}
      </button>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-ds-surface-3/60"
      >
        <div
          className="h-full origin-left bg-primary transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
