"use client";

import { Keyboard, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import { CorreoShortcutsBody } from "./CorreoShortcutsBody";

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoShortcuts;
  onConfig: (config: CorreoShortcuts) => void;
};

export function CorreoShortcutsSheet({ open, onClose, config, onConfig }: Props) {
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CorreoShortcutsBody config={config} onConfig={onConfig} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap"
        >
          Listo
        </button>
      </Surface>
    </div>
  );
}
