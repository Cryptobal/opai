"use client";

import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  AgendaDesktopPrefs,
  FirstDay,
  HourHeightPreset,
  StepMinutes,
} from "./agenda-desktop-prefs";

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const HOUR_HEIGHTS: HourHeightPreset[] = [44, 60, 84];
const STEPS: StepMinutes[] = [5, 15, 30];

const SELECT =
  "h-9 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-2.5 text-ds-body text-ds-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const CHECK =
  "h-4 w-4 rounded border-ds-border-default text-primary focus-visible:ring-2 focus-visible:ring-primary/40";

type Props = {
  prefs: AgendaDesktopPrefs;
  onChange: (next: AgendaDesktopPrefs) => void;
  buttonClass?: string;
};

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Popover de preferencias del calendario (persiste en localStorage). */
export function AgendaPrefsPopover({ prefs, onChange, buttonClass }: Props) {
  const patch = (partial: Partial<AgendaDesktopPrefs>) => {
    const next = { ...prefs, ...partial };
    if (next.endHour <= next.startHour) {
      next.endHour = Math.min(24, next.startHour + 1);
    }
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Configuración del calendario"
        className={cn(buttonClass)}
      >
        <Settings2 className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[min(70vh,520px)] space-y-4 overflow-y-auto rounded-2xl border-ds-border-default bg-ds-surface-1 p-4 shadow-ds-lg"
      >
        <div>
          <p className="font-display text-[14px] font-semibold text-ds-text-1">
            Configuración del calendario
          </p>
          <p className="mt-0.5 text-[12px] text-ds-text-4">
            Zona horaria: America/Santiago
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium text-ds-text-4">Horario visible</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[12px] text-ds-text-3">Desde</span>
              <select
                className={SELECT}
                value={prefs.startHour}
                onChange={(e) => patch({ startHour: Number(e.target.value) })}
              >
                {HOURS.filter((h) => h < 24).map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-ds-text-3">Hasta</span>
              <select
                className={SELECT}
                value={prefs.endHour}
                onChange={(e) => patch({ endHour: Number(e.target.value) })}
              >
                {HOURS.filter((h) => h >= 1).map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium text-ds-text-4">Densidad</legend>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.fitToWindow}
              onChange={(e) => patch({ fitToWindow: e.target.checked })}
            />
            Ajustar a la ventana
          </label>
          {!prefs.fitToWindow && (
            <div className="flex gap-1.5">
              {HOUR_HEIGHTS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => patch({ hourHeight: h })}
                  className={cn(
                    "h-9 flex-1 rounded-xl border text-[12px] font-medium ds-tap",
                    prefs.hourHeight === h
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
                  )}
                >
                  {h}px
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ds-text-4">Paso de grilla</span>
          <select
            className={SELECT}
            value={prefs.stepMinutes}
            onChange={(e) => patch({ stepMinutes: Number(e.target.value) as StepMinutes })}
          >
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {s} minutos
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium text-ds-text-4">Líneas</legend>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.halfHourLine}
              onChange={(e) => patch({ halfHourLine: e.target.checked })}
            />
            Línea de media hora
          </label>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.nowLine}
              onChange={(e) => patch({ nowLine: e.target.checked })}
            />
            Línea de hora actual
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium text-ds-text-4">Semana</legend>
          <label className="block space-y-1">
            <span className="text-[12px] text-ds-text-3">Primer día</span>
            <select
              className={SELECT}
              value={prefs.firstDay}
              onChange={(e) => patch({ firstDay: Number(e.target.value) as FirstDay })}
            >
              <option value={1}>Lunes</option>
              <option value={0}>Domingo</option>
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.showWeekends}
              onChange={(e) => patch({ showWeekends: e.target.checked })}
            />
            Mostrar fines de semana
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[12px] font-medium text-ds-text-4">Contenido</legend>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.showTasks}
              onChange={(e) => patch({ showTasks: e.target.checked })}
            />
            Mostrar tareas
          </label>
          <label className="flex min-h-9 items-center gap-2 text-ds-body text-ds-text-2">
            <input
              type="checkbox"
              className={CHECK}
              checked={prefs.showOwner}
              onChange={(e) => patch({ showOwner: e.target.checked })}
            />
            Mostrar responsable en el evento
          </label>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
