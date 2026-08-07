"use client";

import { SimpleSelect } from "@/components/ui/simple-select";
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

function Selector({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: CorreoSwipeAction;
  onChange: (action: CorreoSwipeAction) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
      <span className="min-w-0 shrink-0 text-[13px] text-ds-text-2">
        {label}
        {hint ? (
          <span className="mt-0.5 block text-[12px] font-normal text-ds-text-4">{hint}</span>
        ) : null}
      </span>
      <SimpleSelect
        value={value}
        onValueChange={(v) => onChange(v as CorreoSwipeAction)}
        aria-label={label}
        className="h-11 min-w-0 max-w-[12rem] border-0 bg-transparent"
        options={Object.entries(ACTION_LABELS).map(([key, actionLabel]) => ({
          value: key,
          label: actionLabel,
        }))}
      />
    </label>
  );
}

type Props = {
  config: CorreoSwipeConfig;
  onConfig: (config: CorreoSwipeConfig) => void;
  /** Si se omite, no se muestra el control de undo (vive en General del modal). */
  undoSeconds?: CorreoUndoSeconds;
  onUndoSeconds?: (seconds: CorreoUndoSeconds) => void;
  showUndo?: boolean;
};

export function CorreoSwipeSettingsBody({
  config, onConfig, undoSeconds, onUndoSeconds, showUndo = true,
}: Props) {
  const set =
    (side: "right" | "left", index: 0 | 1) => (action: CorreoSwipeAction) => {
      const pair = [...config[side]] as [CorreoSwipeAction, CorreoSwipeAction];
      pair[index] = action;
      onConfig({ ...config, [side]: pair });
    };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ds-text-3">
        En iPad y móvil: deslizá un correo para ver dos botones por lado. Tocá el
        botón (no al soltar). Mantené presionado un correo para ver todas las acciones.
        Los atajos de teclado requieren teclado físico (⌘/Ctrl en Mac).
      </p>
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-ds-text-2">Deslizar a la derecha →</p>
        <Selector
          label="Acción 1"
          hint="Botón junto al correo"
          value={config.right[0]}
          onChange={set("right", 0)}
        />
        <Selector
          label="Acción 2"
          hint="Botón exterior"
          value={config.right[1]}
          onChange={set("right", 1)}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-ds-text-2">← Deslizar a la izquierda</p>
        <Selector
          label="Acción 1"
          hint="Botón junto al correo"
          value={config.left[0]}
          onChange={set("left", 0)}
        />
        <Selector
          label="Acción 2"
          hint="Botón exterior"
          value={config.left[1]}
          onChange={set("left", 1)}
        />
      </div>
      {showUndo && undoSeconds != null && onUndoSeconds && (
        <>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
            <span className="min-w-0 text-[13px] text-ds-text-2">Tiempo para deshacer</span>
            <SimpleSelect
              value={String(undoSeconds)}
              onValueChange={(v) => onUndoSeconds(Number(v) as CorreoUndoSeconds)}
              aria-label="Tiempo para deshacer"
              className="h-11 min-w-0 max-w-[6rem] border-0 bg-transparent"
              options={CORREO_UNDO_SECONDS_OPTIONS.map((seconds) => ({
                value: String(seconds),
                label: `${seconds} s`,
              }))}
            />
          </label>
          <p className="text-[12px] text-ds-text-3">
            Aplica a archivar, papelera, destacar y posponer. Los envíos usan la ventana del servidor (10 s por defecto).
          </p>
        </>
      )}
    </div>
  );
}
