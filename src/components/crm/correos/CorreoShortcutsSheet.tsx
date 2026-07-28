"use client";

import { useState } from "react";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import {
  DEFAULT_CORREO_SHORTCUTS,
  assignCorreoShortcut,
  normalizeShortcutKey,
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
  replyAll: "Responder a todos",
  forward: "Reenviar",
  replyAi: "Responder con IA",
  star: "Destacar",
  snooze: "Posponer",
  toggleRead: "Leído / No leído",
  focusSearch: "Buscar",
  aiMenu: "Acciones IA",
};

const ORDER_BANDEJA: CorreoShortcutAction[] = [
  "down", "up", "open", "toggleSelect", "archive", "trash",
  "star", "snooze", "toggleRead", "focusSearch", "aiMenu",
];

const ORDER_LECTOR: CorreoShortcutAction[] = [
  "reply", "replyAll", "forward", "replyAi",
];

/** Muestra la tecla de forma legible (Enter, Espacio, ↑…). */
function keyLabel(key: string): string {
  if (key === "Enter") return "↵ Enter";
  if (key === " ") return "Espacio";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  return key.length === 1 ? normalizeShortcutKey(key).toUpperCase() : key;
}

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoShortcuts;
  /** Se aplica en vivo; la persistencia la maneja useCorreosViewPreferences. */
  onConfig: (config: CorreoShortcuts) => void;
};

function ShortcutRow({
  action,
  config,
  recording,
  setRecording,
  onConfig,
}: {
  action: CorreoShortcutAction;
  config: CorreoShortcuts;
  recording: CorreoShortcutAction | null;
  setRecording: (a: CorreoShortcutAction | null) => void;
  onConfig: (config: CorreoShortcuts) => void;
}) {
  const capture = (event: React.KeyboardEvent) => {
    if (recording !== action) return;
    if (["Shift", "Control", "Alt", "Meta", "Tab", "Escape"].includes(event.key)) {
      if (event.key === "Escape") setRecording(null);
      return;
    }
    event.preventDefault();
    onConfig(assignCorreoShortcut(config, action, event.key));
    setRecording(null);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2">
      <span className="text-[13px] text-ds-text-2">{LABELS[action]}</span>
      <button
        type="button"
        onClick={() => setRecording(action)}
        onKeyDown={capture}
        className={`inline-flex h-8 min-w-[64px] items-center justify-center rounded-lg border px-3 font-mono text-[12px] ds-tap ${
          recording === action
            ? "animate-pulse border-primary bg-primary/10 text-primary"
            : "border-ds-border-default bg-ds-surface-2 text-ds-text-1"
        }`}
      >
        {recording === action ? "Presioná…" : keyLabel(config[action])}
      </button>
    </div>
  );
}

/** Configuración de atajos de teclado: cada fila captura la próxima tecla al
 *  entrar en modo "grabar". Mismo patrón visual que CorreoSwipeSettingsSheet. */
export function CorreoShortcutsSheet({ open, onClose, config, onConfig }: Props) {
  const [recording, setRecording] = useState<CorreoShortcutAction | null>(null);
  if (!open) return null;

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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="space-y-1">
            <p className="px-0.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Bandeja
            </p>
            {ORDER_BANDEJA.map((action) => (
              <ShortcutRow
                key={action}
                action={action}
                config={config}
                recording={recording}
                setRecording={setRecording}
                onConfig={onConfig}
              />
            ))}
          </div>
          <div className="space-y-1 border-l-2 border-primary/40 pl-2">
            <p className="px-0.5 text-[12px] font-medium uppercase tracking-wide text-primary">
              Lector
            </p>
            {ORDER_LECTOR.map((action) => (
              <ShortcutRow
                key={action}
                action={action}
                config={config}
                recording={recording}
                setRecording={setRecording}
                onConfig={onConfig}
              />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { onConfig({ ...DEFAULT_CORREO_SHORTCUTS }); setRecording(null); }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap"
          >
            Listo
          </button>
        </div>
      </Surface>
    </div>
  );
}
