"use client";

import { X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type {
  CorreoSwipeConfig,
  CorreoUndoSeconds,
} from "./useCorreosViewPreferences";
import { CorreoSwipeSettingsBody } from "./CorreoSwipeSettingsBody";

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoSwipeConfig;
  onConfig: (config: CorreoSwipeConfig) => void;
  undoSeconds: CorreoUndoSeconds;
  onUndoSeconds: (seconds: CorreoUndoSeconds) => void;
};

/** Sheet de configuración de gestos de deslizar (wrapper sobre el Body). */
export function CorreoSwipeSettingsSheet({
  open, onClose, config, onConfig, undoSeconds, onUndoSeconds,
}: Props) {
  if (!open) return null;

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
        <CorreoSwipeSettingsBody
          config={config}
          onConfig={onConfig}
          undoSeconds={undoSeconds}
          onUndoSeconds={onUndoSeconds}
        />
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
