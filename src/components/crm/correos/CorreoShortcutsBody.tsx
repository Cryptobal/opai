"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_CORREO_SHORTCUTS,
  assignCorreoShortcut,
  eventToShortcutKey,
  formatShortcutLabel,
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
  star: "Destacar",
  snooze: "Posponer",
  toggleRead: "Leído / No leído",
  focusSearch: "Buscar",
  aiMenu: "Acciones IA",
  sendAndArchive: "Enviar y archivar",
  send: "Enviar (sin archivar)",
};

const ORDER_BANDEJA: CorreoShortcutAction[] = [
  "down", "up", "open", "toggleSelect", "archive", "trash",
  "star", "snooze", "toggleRead", "focusSearch", "aiMenu",
];
const ORDER_LECTOR: CorreoShortcutAction[] = ["reply", "replyAll", "forward"];
const ORDER_REDACCION: CorreoShortcutAction[] = ["sendAndArchive", "send"];

function ShortcutRow({
  action, config, recording, setRecording, onConfig,
}: {
  action: CorreoShortcutAction;
  config: CorreoShortcuts;
  recording: CorreoShortcutAction | null;
  setRecording: (a: CorreoShortcutAction | null) => void;
  onConfig: (config: CorreoShortcuts) => void;
}) {
  const capture = (event: React.KeyboardEvent) => {
    if (recording !== action) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setRecording(null);
      return;
    }
    if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) return;
    const binding = eventToShortcutKey(event);
    if (!binding) return;
    event.preventDefault();
    onConfig(assignCorreoShortcut(config, action, binding));
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
        {recording === action ? "Presioná…" : formatShortcutLabel(config[action])}
      </button>
    </div>
  );
}

type Props = {
  config: CorreoShortcuts;
  onConfig: (config: CorreoShortcuts) => void;
};

export function CorreoShortcutsBody({ config, onConfig }: Props) {
  const [recording, setRecording] = useState<CorreoShortcutAction | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ds-text-3">
        Tocá un atajo y presioná la tecla (o combo ⌘/Ctrl) que quieras
        asignarle. Las flechas ↑/↓ siempre navegan entre correos. En iPad sin
        teclado físico usa deslizar o mantener presionado un correo en la lista;
        con el correo abierto, los íconos Archivar y Eliminar están arriba.
      </p>
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="px-0.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Bandeja</p>
          {ORDER_BANDEJA.map((action) => (
            <ShortcutRow key={action} action={action} config={config}
              recording={recording} setRecording={setRecording} onConfig={onConfig} />
          ))}
        </div>
        <div className="space-y-1 border-l-2 border-primary/40 pl-2">
          <p className="px-0.5 text-[12px] font-medium uppercase tracking-wide text-primary">Lector</p>
          {ORDER_LECTOR.map((action) => (
            <ShortcutRow key={action} action={action} config={config}
              recording={recording} setRecording={setRecording} onConfig={onConfig} />
          ))}
        </div>
        <div className="space-y-1 border-l-2 border-status-ok-border pl-2">
          <p className="px-0.5 text-[12px] font-medium uppercase tracking-wide text-status-ok-fg">Redacción</p>
          {ORDER_REDACCION.map((action) => (
            <ShortcutRow key={action} action={action} config={config}
              recording={recording} setRecording={setRecording} onConfig={onConfig} />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => { onConfig({ ...DEFAULT_CORREO_SHORTCUTS }); setRecording(null); }}
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap"
      >
        <RotateCcw className="h-4 w-4" /> Restaurar
      </button>
    </div>
  );
}
