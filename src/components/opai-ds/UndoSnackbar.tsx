"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  dismissUndo,
  getUndoSnackbarSnapshot,
  subscribeUndoSnackbar,
  type UndoSnackbarState,
} from "./undo-snackbar-store";

/**
 * Host global del snackbar Undo (Liquid Glass). Montar una sola vez junto a
 * `<Toaster />`. Compacto, sin botón X, encima del bottom nav.
 */
export function UndoSnackbarHost() {
  const payload = useSyncExternalStore(
    subscribeUndoSnackbar,
    getUndoSnackbarSnapshot,
    () => null,
  );

  if (!payload) return null;
  return <UndoSnackbarBar key={payload.id} payload={payload} />;
}

function UndoSnackbarBar({ payload }: { payload: UndoSnackbarState }) {
  const [progress, setProgress] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = useCallback(
    (opts?: { silent?: boolean }) => {
      setExiting(true);
      window.setTimeout(() => dismissUndo(payload.id, opts), 160);
    },
    [payload.id],
  );

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
      // silent: no dispara onExpire (el caller ya hizo el undo).
      close({ silent: true });
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-3",
        "bottom-[calc(var(--bottom-nav-height,76px)+10px)] lg:bottom-6",
        exiting ? "animate-out fade-out-0 slide-out-to-bottom-2 duration-150" : "animate-in fade-in-0 slide-in-from-bottom-3 duration-200",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto relative w-full max-w-md overflow-hidden",
          "opai-glass-strong",
          "flex min-h-12 items-center gap-3 px-4 py-2.5",
        )}
      >
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
          {payload.message}
        </p>
        <button
          type="button"
          onClick={() => void onUndo()}
          disabled={busy}
          className="shrink-0 min-h-11 min-w-[72px] px-1 text-[13px] font-semibold text-primary ds-tap disabled:opacity-60"
        >
          {payload.actionLabel}
        </button>
        {/* Barra de progreso de la ventana de deshacer */}
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
    </div>
  );
}
