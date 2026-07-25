"use client";

import { useEffect } from "react";
import { showUndo, dismissUndo, DEFAULT_UNDO_DURATION_MS } from "@/components/opai-ds";

export interface UndoPayload {
  occurrenceName: string;
  destLabel: string;
  undo: () => Promise<void> | void;
}

interface Props {
  payload: UndoPayload | null;
  onDismiss: () => void;
  timeoutMs?: number;
}

/**
 * Adapter: el flujo de cashflow sigue empujando un payload local; lo
 * reenviamos al snackbar Liquid Glass global de OPAI.
 */
export function UndoToast({
  payload,
  onDismiss,
  timeoutMs = DEFAULT_UNDO_DURATION_MS,
}: Props) {
  useEffect(() => {
    if (!payload) return;
    const id = showUndo({
      message: `«${payload.occurrenceName}» → ${payload.destLabel}`,
      durationMs: timeoutMs,
      onExpire: onDismiss,
      onUndo: async () => {
        await payload.undo();
        onDismiss();
      },
    });
    return () => dismissUndo(id, { silent: true });
  }, [payload, onDismiss, timeoutMs]);

  return null;
}
