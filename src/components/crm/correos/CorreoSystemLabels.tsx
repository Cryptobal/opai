"use client";

import { Clock, Trash2, X } from "lucide-react";
import { formatSnoozeWhen } from "@/modules/crm/email/correo-snooze-presets";
import { runCorreoAction } from "./correo-thread-action-client";

type Props = {
  threadId: string;
  trashedAt: string | null;
  snoozedUntil: string | null;
  canModify: boolean;
  onDone?: () => void;
  /** Saca el hilo de la carpeta actual (Papelera / Pospuestos) tras restaurar. */
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onClose?: () => void;
};

/**
 * Etiquetas de sistema estilo Gmail en el lector:
 * - Papelera: chip removible → untrash (vuelve a Recibidos).
 * - Pospuestos: banner con "Dejar de posponer" → unsnooze.
 */
export function CorreoSystemLabels({
  threadId,
  trashedAt,
  snoozedUntil,
  canModify,
  onDone,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onClose,
}: Props) {
  const snoozeActive =
    snoozedUntil != null && new Date(snoozedUntil).getTime() > Date.now();
  const inTrash = Boolean(trashedAt);

  if (!inTrash && !snoozeActive) return null;

  function leaveFolder(action: "untrash" | "unsnooze", okMsg: string) {
    onRemove?.(threadId);
    void runCorreoAction(
      threadId,
      action,
      okMsg,
      onRemoveDone ?? onDone,
      undefined,
      onUndoDone,
    );
    if (!onRemove) onClose?.();
  }

  return (
    <div className="flex flex-col gap-2">
      {snoozeActive && snoozedUntil && (
        <div
          className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px]"
          role="status"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 text-status-warn-fg">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Pospuesto hasta: {formatSnoozeWhen(new Date(snoozedUntil))}
            </span>
          </span>
          {canModify && (
            <button
              type="button"
              onClick={() => leaveFolder("unsnooze", "Dejado de posponer")}
              className="ml-auto shrink-0 text-[13px] font-medium text-primary ds-tap hover:underline"
            >
              Dejar de posponer
            </button>
          )}
        </div>
      )}

      {inTrash && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex h-7 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 pl-2.5 pr-1 text-[12px] font-medium text-ds-text-2"
            title="Esta conversación está en la Papelera"
          >
            <Trash2 className="h-3 w-3 shrink-0 text-ds-text-3" aria-hidden />
            Papelera
            {canModify && (
              <button
                type="button"
                aria-label="Quitar de la Papelera"
                title="Eliminar la etiqueta Papelera de esta conversación"
                onClick={() => leaveFolder("untrash", "Restaurado a bandeja")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
