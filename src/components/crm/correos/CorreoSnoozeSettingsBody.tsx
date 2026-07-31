"use client";

import { SimpleSelect } from "@/components/ui/simple-select";
import {
  CORREO_SNOOZE_AFTERNOON_HOURS,
  CORREO_SNOOZE_MORNING_HOURS,
  type CorreoSnoozeConfig,
} from "@/modules/crm/email/correo-snooze-presets";

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

type Props = {
  config: CorreoSnoozeConfig;
  onConfig: (config: CorreoSnoozeConfig) => void;
};

export function CorreoSnoozeSettingsBody({ config, onConfig }: Props) {
  const patch = (partial: Partial<CorreoSnoozeConfig>) => {
    onConfig({ ...config, ...partial });
  };

  return (
    <div className="space-y-3">
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
            onValueChange={(v) => patch({ weekendDay: Number(v) as 0 | 6 })}
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
    </div>
  );
}
