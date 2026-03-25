"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { QuickTimePicker } from "@/components/ops/rondas/QuickTimePicker";
import { previewSlotTimes } from "@/lib/rondas/schedule-engine";

export interface ProgramacionPayload {
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  horariosCustom?: string[] | null;
  toleranciaMinutos: number;
}

export interface EditingProgramacion {
  id: string;
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  horariosCustom?: string[] | null;
  toleranciaMinutos: number;
}

type ScheduleMode = "frequency" | "custom";

const FREQ_PRESETS = [60, 90, 120] as const;

function detectMode(editing?: EditingProgramacion | null): ScheduleMode {
  if (editing?.horariosCustom && editing.horariosCustom.length > 0) return "custom";
  return "frequency";
}

/** Sort HH:mm strings relative to a start hour (for overnight windows) */
function sortTimesRelative(times: string[], horaInicio: string): string[] {
  const [sh] = horaInicio.split(":").map(Number);
  return [...times].sort((a, b) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    const aNorm = ah < sh ? ah + 24 : ah;
    const bNorm = bh < sh ? bh + 24 : bh;
    return aNorm * 60 + am - (bNorm * 60 + bm);
  });
}

export function ProgramacionForm({
  templates,
  onSubmit,
  editingProgramacion,
  onCancelEdit,
}: {
  templates: { id: string; name: string }[];
  onSubmit: (payload: ProgramacionPayload) => Promise<void> | void;
  editingProgramacion?: EditingProgramacion | null;
  onCancelEdit?: () => void;
}) {
  const [templateId, setTemplateId] = useState(editingProgramacion?.rondaTemplateId ?? "");
  const [diasSemana, setDiasSemana] = useState<number[]>(editingProgramacion?.diasSemana ?? [0, 1, 2, 3, 4, 5, 6]);
  const [horaInicio, setHoraInicio] = useState(editingProgramacion?.horaInicio ?? "21:00");
  const [horaFin, setHoraFin] = useState(editingProgramacion?.horaFin ?? "08:00");
  const [frecuenciaMinutos, setFrecuenciaMinutos] = useState(editingProgramacion?.frecuenciaMinutos ?? 60);
  const [toleranciaMinutos, setToleranciaMinutos] = useState(editingProgramacion?.toleranciaMinutos ?? 20);
  const [horariosCustom, setHorariosCustom] = useState<string[]>(editingProgramacion?.horariosCustom ?? []);
  const [mode, setMode] = useState<ScheduleMode>(detectMode(editingProgramacion));
  const [saving, setSaving] = useState(false);

  const dayLabels = [
    { label: "L", value: 1 },
    { label: "M", value: 2 },
    { label: "X", value: 3 },
    { label: "J", value: 4 },
    { label: "V", value: 5 },
    { label: "S", value: 6 },
    { label: "D", value: 0 },
  ];

  const previewTimes = useMemo(
    () =>
      mode === "frequency"
        ? previewSlotTimes(horaInicio, horaFin, frecuenciaMinutos)
        : sortTimesRelative(horariosCustom, horaInicio),
    [mode, horaInicio, horaFin, frecuenciaMinutos, horariosCustom],
  );

  const addCustomTime = (time: string) => {
    if (!horariosCustom.includes(time)) {
      setHorariosCustom((prev) => sortTimesRelative([...prev, time], horaInicio));
    }
  };

  const removeCustomTime = (time: string) => {
    setHorariosCustom((prev) => prev.filter((t) => t !== time));
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!templateId) return;
        if (mode === "custom" && horariosCustom.length === 0) return;
        setSaving(true);
        try {
          await onSubmit({
            rondaTemplateId: templateId,
            diasSemana,
            horaInicio,
            horaFin,
            frecuenciaMinutos,
            horariosCustom: mode === "custom" ? horariosCustom : null,
            toleranciaMinutos,
          });
          // Reset form on create (not edit)
          if (!editingProgramacion) {
            setHorariosCustom([]);
          }
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        Define cuándo ejecutar rondas automáticamente. Selecciona la plantilla, el horario y los días.
      </p>

      {/* Row 1: Plantilla + Horario + Tolerancia */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2 sm:col-span-1 space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Plantilla</label>
          <SearchableSelect
            value={templateId}
            options={templates.map((t) => ({ id: t.id, label: t.name }))}
            placeholder="Selecciona..."
            onChange={setTemplateId}
          />
        </div>
        <QuickTimePicker value={horaInicio} onChange={setHoraInicio} label="Hora inicio" />
        <QuickTimePicker value={horaFin} onChange={setHoraFin} label="Hora fin" />
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Tolerancia (min)</label>
          <Input
            type="number"
            className="h-9"
            value={String(toleranciaMinutos)}
            onChange={(e) => setToleranciaMinutos(Number(e.target.value))}
            onBlur={() => setToleranciaMinutos((v) => Math.max(0, Math.min(120, v || 10)))}
            placeholder="Ej: 20"
          />
          <p className="text-[10px] text-muted-foreground/80 hidden sm:block">
            Minutos antes en que puede iniciar.
          </p>
        </div>
      </div>

      {/* Row 2: Mode toggle */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("frequency")}
          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            mode === "frequency"
              ? "bg-primary/15 border-primary/40 text-primary"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          Frecuencia fija
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            mode === "custom"
              ? "bg-primary/15 border-primary/40 text-primary"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          Horarios manuales
        </button>
      </div>

      {/* Row 3: Mode-specific content */}
      {mode === "frequency" && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {FREQ_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFrecuenciaMinutos(preset)}
                className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                  frecuenciaMinutos === preset
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {preset} min
              </button>
            ))}
            <div className="w-20">
              <Input
                type="number"
                className="h-full text-xs text-center"
                min={30}
                max={360}
                value={!FREQ_PRESETS.includes(frecuenciaMinutos as 60 | 90 | 120) ? String(frecuenciaMinutos) : ""}
                placeholder="Otro"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0) setFrecuenciaMinutos(v);
                }}
                onBlur={() => setFrecuenciaMinutos((v) => Math.max(30, Math.min(360, v || 60)))}
              />
            </div>
          </div>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-2">
          {/* Custom times chips */}
          {horariosCustom.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sortTimesRelative(horariosCustom, horaInicio).map((time) => (
                <span
                  key={time}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {time}
                  <button
                    type="button"
                    onClick={() => removeCustomTime(time)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                    aria-label={`Eliminar ${time}`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add time: inline QuickTimePicker always visible */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <QuickTimePicker
                value="--:--"
                onChange={(time) => addCustomTime(time)}
                label="Agregar horario"
              />
            </div>
          </div>

          {horariosCustom.length === 0 && (
            <p className="text-[10px] text-muted-foreground/70 text-center">
              Agrega al menos un horario para programar rondas.
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {previewTimes.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
          <p className="text-[10px] text-muted-foreground/80 mb-1">
            {previewTimes.length} ronda{previewTimes.length !== 1 ? "s" : ""} por día
          </p>
          <div className="flex flex-wrap gap-1">
            {previewTimes.map((t, i) => (
              <span key={t + i} className="text-xs font-mono text-foreground/80">
                {t}{i < previewTimes.length - 1 && <span className="text-muted-foreground/50 mx-0.5">→</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Days */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          {dayLabels.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              className={`h-8 w-8 rounded text-xs border transition-colors ${
                diasSemana.includes(value)
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground"
              }`}
              onClick={() =>
                setDiasSemana((prev) =>
                  prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            { label: "Toda la semana", days: [0, 1, 2, 3, 4, 5, 6] },
            { label: "Lun a Vie", days: [1, 2, 3, 4, 5] },
            { label: "Fin de semana", days: [0, 6] },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="text-[11px] rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              onClick={() => setDiasSemana(preset.days)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="h-9"
          disabled={saving || !templateId || !diasSemana.length || (mode === "custom" && horariosCustom.length === 0)}
        >
          {saving ? "Guardando..." : editingProgramacion ? "Guardar cambios" : "Crear programación"}
        </Button>
        {editingProgramacion && onCancelEdit && (
          <Button type="button" variant="outline" className="h-9" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
