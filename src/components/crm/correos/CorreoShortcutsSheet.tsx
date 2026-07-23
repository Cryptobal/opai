"use client";

import { useState } from "react";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import {
  DEFAULT_CORREO_SHORTCUTS,
  type CorreoShortcutAction,
  type CorreoShortcuts,
} from "./useCorreosViewPreferences";

const LABELS: Record<CorreoShortcutAction, string> = {
  down: "Correo siguiente",
  up: "Correo anterior",
  open: "Abrir correo",
  toggleSelect: "Seleccionar",
  archive: "Archivar",
  trash: "Eliminar",
  reply: "Responder",
  star: "Destacar",
  snooze: "Posponer",
  toggleRead: "Leído / No leído",
  focusSearch: "Buscar",
};

const ORDER: CorreoShortcutAction[] = [
  "down", "up", "open", "toggleSelect", "archive", "trash",
  "reply", "star", "snooze", "toggleRead", "focusSearch",
];

/** Muestra la tecla de forma legible (Enter, Espacio, ↑…). */
function keyLabel(key: string): string {
  if (key === "Enter") return "↵ Enter";
  if (key === " ") return "Espacio";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  return key.length === 1 ? key.toUpperCase() : key;
}

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoShortcuts;
  /** Se aplica en vivo; la persistencia la maneja useCorreosViewPreferences. */
  onConfig: (config: CorreoShortcuts) => void;
};

/** Configuración de atajos de teclado: cada fila captura la próxima tecla al
 *  entrar en modo "grabar". Mismo patrón visual que CorreoSwipeSettingsSheet. */
export function CorreoShortcutsSheet({ open, onClose, config, onConfig }: Props) {
  const [recording, setRecording] = useState<CorreoShortcutAction | null>(null);
  if (!open) return null;

  const capture = (action: CorreoShortcutAction) => (event: React.KeyboardEvent) => {
    if (recording !== action) return;
    // Teclas de control que no queremos asignar.
    if (["Shift", "Control", "Alt", "Meta", "Tab", "Escape"].includes(event.key)) {
      if (event.key === "Escape") setRecording(null);
      return;
    }
    event.preventDefault();
    onConfig({ ...config, [action]: event.key });
    setRecording(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <Surface
        elevation={2}
        padding="md"
        className="flex max-h-[85dvh] w-full flex-col gap-3 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:max-w-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-ds-surface-3" />
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-ds-text-2" />
            <p className="font-display text-sm font-semibold text-ds-text-1">Atajos de teclado</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="shrink-0 text-[12px] text-ds-text-3">
          Tocá un atajo y presioná la tecla que quieras asignarle. Las flechas
          ↑/↓ siempre navegan entre correos.
        </p>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {ORDER.map((action) => (
            <div
              key={action}
              className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2"
            >
              <span className="text-[13px] text-ds-text-2">{LABELS[action]}</span>
              <button
                type="button"
                onClick={() => setRecording(action)}
                onKeyDown={capture(action)}
                className={`inline-flex h-8 min-w-[64px] items-center justify-center rounded-lg border px-3 font-mono text-[12px] ds-tap ${
                  recording === action
                    ? "animate-pulse border-primary bg-primary/10 text-primary"
                    : "border-ds-border-default bg-ds-surface-2 text-ds-text-1"
                }`}
              >
                {recording === action ? "Presioná…" : keyLabel(config[action])}
              </button>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { onConfig({ ...DEFAULT_CORREO_SHORTCUTS }); setRecording(null); }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap"
          >
            Listo
          </button>
        </div>
      </Surface>
    </div>
  );
}
