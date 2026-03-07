"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { QuickTimePicker } from "@/components/ops/rondas/QuickTimePicker";

export interface ProgramacionPayload {
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  toleranciaMinutos: number;
}

export interface EditingProgramacion {
  id: string;
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  toleranciaMinutos: number;
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
  const [diasSemana, setDiasSemana] = useState<number[]>(editingProgramacion?.diasSemana ?? [1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState(editingProgramacion?.horaInicio ?? "21:00");
  const [horaFin, setHoraFin] = useState(editingProgramacion?.horaFin ?? "08:00");
  const [frecuenciaMinutos, setFrecuenciaMinutos] = useState(editingProgramacion?.frecuenciaMinutos ?? 120);
  const [toleranciaMinutos, setToleranciaMinutos] = useState(editingProgramacion?.toleranciaMinutos ?? 10);
  const [saving, setSaving] = useState(false);

  const dayLabels = ["D", "L", "M", "X", "J", "V", "S"];

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!templateId) return;
        setSaving(true);
        try {
          await onSubmit({
            rondaTemplateId: templateId,
            diasSemana,
            horaInicio,
            horaFin,
            frecuenciaMinutos,
            toleranciaMinutos,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        Define cuándo ejecutar rondas automáticamente. Selecciona la plantilla, el horario, los días y la frecuencia.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Plantilla</label>
          <SearchableSelect
            value={templateId}
            options={templates.map((t) => ({ id: t.id, label: t.name }))}
            placeholder="Selecciona plantilla..."
            onChange={setTemplateId}
          />
        </div>
        <QuickTimePicker value={horaInicio} onChange={setHoraInicio} label="Hora inicio" />
        <QuickTimePicker value={horaFin} onChange={setHoraFin} label="Hora fin" />
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Frecuencia (min)</label>
          <Input
            type="number"
            className="h-9"
            min={30}
            max={360}
            value={String(frecuenciaMinutos)}
            onChange={(e) => setFrecuenciaMinutos(Math.max(30, Number(e.target.value)))}
            placeholder="Ej: 120"
          />
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Cada cuántos minutos se genera una ronda (mín. 30). Ej: 120 = cada 2 horas.
          </p>
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Tolerancia (min)</label>
          <Input
            type="number"
            className="h-9"
            value={String(toleranciaMinutos)}
            onChange={(e) => setToleranciaMinutos(Number(e.target.value))}
            placeholder="Ej: 10"
          />
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Minutos antes de la hora en que el guardia puede iniciar. Pasado este margen, se marca atrasada.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-2">
          {dayLabels.map((lbl, idx) => (
            <button
              key={lbl}
              type="button"
              className={`h-8 w-8 rounded text-xs border ${diasSemana.includes(idx) ? "bg-primary/20 border-primary/40" : "border-border"}`}
              onClick={() =>
                setDiasSemana((prev) =>
                  prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                )
              }
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            { label: "Toda la semana", days: [0, 1, 2, 3, 4, 5, 6] },
            { label: "Lunes a viernes", days: [1, 2, 3, 4, 5] },
            { label: "Fines de semana", days: [0, 6] },
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

      <div className="flex gap-2">
        <Button type="submit" className="h-9" disabled={saving || !templateId || !diasSemana.length}>
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
