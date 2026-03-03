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

export function ProgramacionForm({
  templates,
  onSubmit,
}: {
  templates: { id: string; name: string }[];
  onSubmit: (payload: ProgramacionPayload) => Promise<void> | void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState("22:00");
  const [horaFin, setHoraFin] = useState("06:00");
  const [frecuenciaMinutos, setFrecuenciaMinutos] = useState(120);
  const [toleranciaMinutos, setToleranciaMinutos] = useState(10);
  const [saving, setSaving] = useState(false);

  const dayLabels = ["D", "L", "M", "X", "J", "V", "S"];

  return (
    <form
      className="rounded-lg border border-border bg-card p-4 space-y-4"
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
      <div>
        <h3 className="text-sm font-semibold">Nueva Programacion</h3>
        <p className="text-xs text-muted-foreground">Configura cuando y con que frecuencia se generan rondas automaticamente.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Plantilla *</label>
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hora inicio</label>
          <Input type="time" className="h-9" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hora fin</label>
          <Input type="time" className="h-9" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Frecuencia (min)</label>
          <Input
            type="number"
            className="h-9"
            value={String(frecuenciaMinutos)}
            onChange={(e) => setFrecuenciaMinutos(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tolerancia (min)</label>
          <Input
            type="number"
            className="h-9"
            value={String(toleranciaMinutos)}
            onChange={(e) => setToleranciaMinutos(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Dias de la semana</label>
        <div className="flex gap-2">
          {dayLabels.map((lbl, idx) => (
            <button
              key={lbl}
              type="button"
              className={`h-8 w-8 rounded text-xs font-medium border transition-colors ${diasSemana.includes(idx) ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}
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
      </div>

      <Button type="submit" className="h-9" disabled={saving || !templateId || !diasSemana.length}>
        {saving ? "Guardando..." : "Crear programacion"}
      </Button>
    </form>
  );
}
