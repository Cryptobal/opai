"use client";

import { CalendarClock } from "lucide-react";
import {
  buildCorreoSnoozePresets,
  formatSnoozeWhenShort,
  type CorreoSnoozeConfig,
} from "@/modules/crm/email/correo-snooze-presets";

type Props = {
  config?: CorreoSnoozeConfig;
  /** Preset elegido: instante ISO + etiqueta legible. */
  onPick: (iso: string, label: string) => void;
  /** «Elegir fecha…» → abre el CorreoSnoozeSheet completo. */
  onOpenSheet: () => void;
  onClose: () => void;
};

/**
 * Popover de posponer rápido, anclado sobre la isla. Primeros 4 presets de
 * `buildCorreoSnoozePresets` + «Elegir fecha…» (delega en el sheet existente).
 */
export function CorreoSnoozeQuickPopover({ config, onPick, onOpenSheet, onClose }: Props) {
  const presets = buildCorreoSnoozePresets(new Date(), config).slice(0, 4);

  return (
    <>
      {/* Scrim: cierra al tocar fuera y evita el click sintetizado sobre la isla. */}
      <div
        aria-hidden
        className="fixed inset-0 z-[45]"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        role="menu"
        className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-[46] overflow-hidden rounded-2xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-ds-lg"
      >
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(p.at.toISOString(), p.label)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
          >
            <span className="font-medium">{p.label}</span>
            <span className="shrink-0 font-mono text-[12px] text-ds-text-3">
              {formatSnoozeWhenShort(p.at)}
            </span>
          </button>
        ))}
        <div className="my-1 border-t border-ds-border-subtle" role="separator" />
        <button
          type="button"
          role="menuitem"
          onClick={onOpenSheet}
          className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-[13px] font-medium text-ds-text-1 ds-tap hover:bg-ds-surface-2"
        >
          <CalendarClock className="h-4 w-4 text-ds-text-3" /> Elegir fecha…
        </button>
      </div>
    </>
  );
}
