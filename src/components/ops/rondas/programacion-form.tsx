"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [horaInicio, setHoraInicio] = useState(editingProgramacion?.horaInicio ?? "22:00");
  const [horaFin, setHoraFin] = useState(editingProgramacion?.horaFin ?? "06:00");
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
          <select
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            required
          >
            <option value="">Selecciona plantilla</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Hora inicio</label>
          <Input type="time" className="h-9" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Hora fin</label>
          <Input type="time" className="h-9" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Frecuencia (min)</label>
          <Input
            type="number"
            className="h-9"
            value={String(frecuenciaMinutos)}
            onChange={(e) => setFrecuenciaMinutos(Number(e.target.value))}
            placeholder="Ej: 120"
          />
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Cada cuántos minutos se genera una ronda. Ej: 120 = cada 2 horas.
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
