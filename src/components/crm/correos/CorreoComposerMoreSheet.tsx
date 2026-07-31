"use client";

import {
  Archive,
  CalendarClock,
  PenLine,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";

type Props = {
  open: boolean;
  onClose: () => void;
  canSendAndArchive: boolean;
  onSendAndArchive: () => void;
  onSchedule: () => void;
  onOpenSignature?: () => void;
  onOpenAiStyle?: () => void;
  onDiscard: () => void;
};

/** Sheet ⋯ del composer móvil: envío, firma, estilo, descartar. */
export function CorreoComposerMoreSheet({
  open,
  onClose,
  canSendAndArchive,
  onSendAndArchive,
  onSchedule,
  onOpenSignature,
  onOpenAiStyle,
  onDiscard,
}: Props) {
  if (!open) return null;

  const row =
    "flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2";

  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <Surface
        elevation={2}
        padding="md"
        role="dialog"
        aria-label="Más opciones"
        className="w-full space-y-2 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3" />
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-ds-text-1">Opciones</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          {canSendAndArchive && (
            <button type="button" onClick={pick(onSendAndArchive)} className={`${row} border-b border-ds-border-subtle`}>
              <Archive className="h-4 w-4 shrink-0 text-ds-text-3" /> Enviar y archivar
            </button>
          )}
          <button type="button" onClick={pick(onSchedule)} className={`${row} border-b border-ds-border-subtle`}>
            <CalendarClock className="h-4 w-4 shrink-0 text-ds-text-3" /> Programar envío
          </button>
          {onOpenSignature && (
            <button type="button" onClick={pick(onOpenSignature)} className={`${row} border-b border-ds-border-subtle`}>
              <PenLine className="h-4 w-4 shrink-0 text-ds-text-3" /> Firma
            </button>
          )}
          {onOpenAiStyle && (
            <button type="button" onClick={pick(onOpenAiStyle)} className={`${row} border-b border-ds-border-subtle`}>
              <WandSparkles className="h-4 w-4 shrink-0 text-ds-text-3" /> Estilo de respuesta
            </button>
          )}
          <button
            type="button"
            onClick={pick(onDiscard)}
            className={`${row} text-status-danger-fg`}
          >
            <Trash2 className="h-4 w-4 shrink-0" /> Descartar borrador
          </button>
        </div>
      </Surface>
    </div>
  );
}
