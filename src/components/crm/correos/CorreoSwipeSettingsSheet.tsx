"use client";

import { X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type {
  CorreoSwipeAction,
  CorreoSwipeConfig,
  CorreoUndoSeconds,
} from "./useCorreosViewPreferences";
import { CORREO_UNDO_SECONDS_OPTIONS } from "./useCorreosViewPreferences";

const ACTION_LABELS: Record<CorreoSwipeAction, string> = {
  archive: "Archivar",
  trash: "Papelera",
  snooze: "Posponer",
  read: "Leído / No leído",
  star: "Destacar",
  reply: "Responder",
};

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoSwipeConfig;
  /** Se aplica en vivo; la persistencia la maneja useCorreosViewPreferences. */
  onConfig: (config: CorreoSwipeConfig) => void;
  undoSeconds: CorreoUndoSeconds;
  onUndoSeconds: (seconds: CorreoUndoSeconds) => void;
};

function Selector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CorreoSwipeAction;
  onChange: (action: CorreoSwipeAction) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
      <span className="shrink-0 text-[13px] text-ds-text-2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as CorreoSwipeAction)}
        className="h-11 min-w-0 border-0 bg-transparent text-right text-[13px] text-ds-text-1 outline-none"
      >
        {Object.entries(ACTION_LABELS).map(([key, actionLabel]) => (
          <option key={key} value={key}>{actionLabel}</option>
        ))}
      </select>
    </label>
  );
}

/** Sheet de configuración de los gestos de deslizar (mismo patrón visual
 *  que CorreoSnoozeSheet). La acción 1 de cada lado es la del swipe largo. */
export function CorreoSwipeSettingsSheet({
  open, onClose, config, onConfig, undoSeconds, onUndoSeconds,
}: Props) {
  if (!open) return null;

  const set =
    (side: "right" | "left", index: 0 | 1) => (action: CorreoSwipeAction) => {
      const pair = [...config[side]] as [CorreoSwipeAction, CorreoSwipeAction];
      pair[index] = action;
      onConfig({ ...config, [side]: pair });
    };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <Surface
        elevation={2}
        padding="md"
        className="w-full space-y-3 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:max-w-sm md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3" />
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-ds-text-1">Gestos de deslizar</p>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-[12px] text-ds-text-3">
          Deslizá corto para ver los botones o ejecutar la acción secundaria; largo o flick para la principal.
        </p>

        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-ds-text-2">Deslizar a la derecha →</p>
          <Selector label="Acción 1 (principal)" value={config.right[0]} onChange={set("right", 0)} />
          <Selector label="Acción 2" value={config.right[1]} onChange={set("right", 1)} />
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-ds-text-2">← Deslizar a la izquierda</p>
          <Selector label="Acción 1 (principal)" value={config.left[0]} onChange={set("left", 0)} />
          <Selector label="Acción 2" value={config.left[1]} onChange={set("left", 1)} />
        </div>

        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
          <span className="min-w-0 text-[13px] text-ds-text-2">Tiempo para deshacer</span>
          <select
            value={undoSeconds}
            onChange={(event) => onUndoSeconds(Number(event.target.value) as CorreoUndoSeconds)}
            className="h-11 min-w-0 border-0 bg-transparent text-right text-[13px] text-ds-text-1 outline-none"
          >
            {CORREO_UNDO_SECONDS_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>{seconds} s</option>
            ))}
          </select>
        </label>
        <p className="text-[12px] text-ds-text-3">
          Aplica a archivar, papelera, destacar y posponer. Los envíos usan la ventana del servidor (10 s por defecto).
        </p>

        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap"
        >
          Listo
        </button>
      </Surface>
    </div>
  );
}
