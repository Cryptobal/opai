"use client";

import { Clock, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  CORREO_SNOOZE_AFTERNOON_HOURS,
  CORREO_SNOOZE_MORNING_HOURS,
  type CorreoSnoozeConfig,
} from "@/modules/crm/email/correo-snooze-presets";

type Props = {
  open: boolean;
  onClose: () => void;
  config: CorreoSnoozeConfig;
  onConfig: (config: CorreoSnoozeConfig) => void;
};

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Configura las horas/días de los presets de posponer (persistido en
 * preferencias de bandeja, mismo patrón que gestos de deslizar).
 */
export function CorreoSnoozeSettingsSheet({
  open,
  onClose,
  config,
  onConfig,
}: Props) {
  if (!open) return null;

  const patch = (partial: Partial<CorreoSnoozeConfig>) => {
    onConfig({ ...config, ...partial });
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
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3 md:hidden" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">
              Horarios de posponer
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-[12px] text-ds-text-3">
          Definí a qué hora vuelven los correos en «Mañana», «Hoy más tarde»,
          fin de semana y próxima semana. «En 1 hora» y «En 3 horas» son fijos.
        </p>

        <div className="space-y-1.5">
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
            <span className="min-w-0 text-[13px] text-ds-text-2">Mañana / semana</span>
            <SimpleSelect
              value={String(config.morningHour)}
              onValueChange={(v) => patch({ morningHour: Number(v) })}
              aria-label="Hora de mañana y próxima semana"
              className="h-11 min-w-0 max-w-[7rem] border-0 bg-transparent"
              options={CORREO_SNOOZE_MORNING_HOURS.map((h) => ({
                value: String(h),
                label: hourLabel(h),
              }))}
            />
          </label>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
            <span className="min-w-0 text-[13px] text-ds-text-2">Hoy más tarde</span>
            <SimpleSelect
              value={String(config.afternoonHour)}
              onValueChange={(v) => patch({ afternoonHour: Number(v) })}
              aria-label="Hora de hoy más tarde"
              className="h-11 min-w-0 max-w-[7rem] border-0 bg-transparent"
              options={CORREO_SNOOZE_AFTERNOON_HOURS.map((h) => ({
                value: String(h),
                label: hourLabel(h),
              }))}
            />
          </label>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
            <span className="min-w-0 text-[13px] text-ds-text-2">Fin de semana</span>
            <SimpleSelect
              value={String(config.weekendDay)}
              onValueChange={(v) =>
                patch({ weekendDay: Number(v) as 0 | 6 })
              }
              aria-label="Día de fin de semana"
              className="h-11 min-w-0 max-w-[8rem] border-0 bg-transparent"
              options={[
                { value: "6", label: "Sábado" },
                { value: "0", label: "Domingo" },
              ]}
            />
          </label>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
            <span className="min-w-0 text-[13px] text-ds-text-2">Próxima semana</span>
            <SimpleSelect
              value={String(config.nextWeekDay)}
              onValueChange={(v) =>
                patch({ nextWeekDay: Number(v) as 1 | 2 | 3 | 4 | 5 })
              }
              aria-label="Día de la próxima semana"
              className="h-11 min-w-0 max-w-[8rem] border-0 bg-transparent"
              options={[
                { value: "1", label: "Lunes" },
                { value: "2", label: "Martes" },
                { value: "3", label: "Miércoles" },
                { value: "4", label: "Jueves" },
                { value: "5", label: "Viernes" },
              ]}
            />
          </label>
        </div>

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
