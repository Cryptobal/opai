"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Clock, Settings2, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { TaskDatePicker } from "@/components/agenda/TaskDatePicker";
import { TaskTimePicker } from "@/components/agenda/TaskTimePicker";
import { todayInChile } from "@/lib/dates-cl";
import {
  buildCorreoSnoozePresets,
  chileDateTimeToUtc,
  DEFAULT_CORREO_SNOOZE_CONFIG,
  formatSnoozeWhen,
  formatSnoozeWhenShort,
  parseCorreoSnoozeConfig,
  type CorreoSnoozeConfig,
} from "@/modules/crm/email/correo-snooze-presets";
import { parseCorreosViewPreferences } from "./useCorreosViewPreferences";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Recibe el instante elegido (ISO) y su etiqueta legible en hora Chile. */
  onConfirm: (untilISO: string, label: string) => void;
  /** Preferencia viva desde useCorreosViewPreferences; si falta, lee localStorage. */
  config?: CorreoSnoozeConfig;
  /** Abre el sheet de horarios configurables (Gestos / Posponer). */
  onOpenSettings?: () => void;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultCustomTime(cfg: CorreoSnoozeConfig): string {
  return `${pad2(cfg.morningHour)}:00`;
}

/**
 * Sheet de posponer estilo Gmail: presets (+1h, +3h, hoy más tarde, mañana,
 * esta semana, fin de semana, próxima semana) + fecha/hora custom no nativa.
 */
export function CorreoSnoozeSheet({
  open,
  onClose,
  onConfirm,
  config: configProp,
  onOpenSettings,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("08:00");
  const [storedConfig, setStoredConfig] = useState<CorreoSnoozeConfig>(
    DEFAULT_CORREO_SNOOZE_CONFIG,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setCustomOpen(false);
      return;
    }
    if (configProp) return;
    try {
      const raw = localStorage.getItem("opai.crm.correos.view.v1");
      const prefs = parseCorreosViewPreferences(raw);
      setStoredConfig(prefs.snoozeConfig ?? DEFAULT_CORREO_SNOOZE_CONFIG);
    } catch {
      setStoredConfig(DEFAULT_CORREO_SNOOZE_CONFIG);
    }
  }, [open, configProp]);

  const config = useMemo(
    () => parseCorreoSnoozeConfig(configProp ?? storedConfig),
    [configProp, storedConfig],
  );

  const presets = useMemo(() => {
    if (!open) return [];
    return buildCorreoSnoozePresets(new Date(), config);
  }, [open, config]);

  useEffect(() => {
    if (!open || !customOpen) return;
    setCustomDate((prev) => prev || todayInChile());
    setCustomTime((prev) => (prev ? prev : defaultCustomTime(config)));
  }, [open, customOpen, config]);

  if (!mounted || !open) return null;

  function pick(at: Date, label: string) {
    // Cerrar el sheet antes del confirm: el confirm suele desmontar el lector
    // (posponer/archivar) y un onClose después disparaba setState en unmounted.
    onClose();
    onConfirm(at.toISOString(), label);
  }

  function pickCustom() {
    const at = chileDateTimeToUtc(customDate, customTime);
    if (!at || at.getTime() <= Date.now()) return;
    pick(at, formatSnoozeWhen(at));
  }

  const customValid = (() => {
    const at = chileDateTimeToUtc(customDate, customTime);
    return Boolean(at && at.getTime() > Date.now());
  })();

  return createPortal(
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

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">
              Posponer hasta…
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onOpenSettings && (
              <button
                type="button"
                aria-label="Configurar horarios de posponer"
                title="Configurar horarios"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ds-text-3 ds-tap hover:bg-ds-surface-2 sm:h-9 sm:w-9"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          {presets.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.at, p.label)}
              className={`flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 ${
                i > 0 ? "border-t border-ds-border-subtle" : ""
              }`}
            >
              <span className="font-medium">{p.label}</span>
              <span className="shrink-0 font-mono text-[12px] text-ds-text-3">
                {formatSnoozeWhenShort(p.at)}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {!customOpen ? (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-dashed border-ds-border-default bg-ds-surface-1 px-3.5 text-[13px] font-medium text-ds-text-1 ds-tap hover:bg-ds-surface-2"
            >
              <CalendarDays className="h-4 w-4 text-ds-text-3" />
              Elegir fecha y hora
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
              <p className="text-[12px] font-medium text-ds-text-2">
                Elegir fecha y hora
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TaskDatePicker
                  value={customDate}
                  onChange={setCustomDate}
                  allowEmpty={false}
                  ariaLabel="Fecha de posponer"
                />
                <TaskTimePicker
                  value={customTime}
                  onChange={(t) => {
                    if (t) setCustomTime(t);
                  }}
                  ariaLabel="Hora de posponer"
                />
              </div>
              <p className="text-[12px] text-ds-text-4">Hora Chile</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="h-11 flex-1 rounded-xl border border-ds-border-default text-[13px] font-medium text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:h-10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={pickCustom}
                  disabled={!customValid}
                  className="h-11 flex-1 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-10"
                >
                  Posponer
                </button>
              </div>
            </div>
          )}
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
