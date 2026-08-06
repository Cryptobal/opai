"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

export type InlineSaveResult = {
  persisted: string | null;
  note?: string;
};

type SaveFn = (key: string, value: string | null) => Promise<string | null>;

/**
 * Secuencia commit / rollback / toast para un campo inline.
 * Deduplica blur+Enter con un flag en vuelo.
 */
export function useInlineFieldSave() {
  const inFlight = useRef(false);

  const commit = useCallback(
    async (opts: {
      key: string;
      label: string;
      next: string | null;
      prev: string | null;
      onCommit: SaveFn;
      note?: string;
    }): Promise<{ ok: true; persisted: string | null } | { ok: false; error: string }> => {
      const { key, label, next, prev, onCommit, note } = opts;

      // Sin cambios → no PATCH
      const normPrev = prev ?? null;
      const normNext = next ?? null;
      if (normPrev === normNext) {
        return { ok: true, persisted: normPrev };
      }

      if (inFlight.current) {
        return { ok: true, persisted: normPrev };
      }
      inFlight.current = true;

      try {
        const persisted = await onCommit(key, normNext);
        const msg = note
          ? `${label}: ${note}`
          : `${label} actualizado`;
        toast.success(msg, { duration: 2000 });
        return { ok: true, persisted };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo guardar";
        toast.error(message);
        return { ok: false, error: message };
      } finally {
        inFlight.current = false;
      }
    },
    []
  );

  return { commit, isSaving: () => inFlight.current };
}
