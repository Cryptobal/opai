"use client";

import { Clock, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type { CorreoSnoozeConfig } from "@/modules/crm/email/correo-snooze-presets";
import { CorreoSnoozeSettingsBody } from "./CorreoSnoozeSettingsBody";

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoSnoozeConfig;
  onConfig: (config: CorreoSnoozeConfig) => void;
};

export function CorreoSnoozeSettingsSheet({
  open, onClose, config, onConfig,
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
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3 md:hidden" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">
              Horarios de posponer
            </p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>
        <CorreoSnoozeSettingsBody config={config} onConfig={onConfig} />
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
