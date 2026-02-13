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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <select
          className="h-10 rounded border border-border bg-background px-2 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          required
        >
          <option value="">Selecciona plantilla</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <Input type="time" className="h-10" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        <Input type="time" className="h-10" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        <Input
          type="number"
          className="h-10"
          value={String(frecuenciaMinutos)}
          onChange={(e) => setFrecuenciaMinutos(Number(e.target.value))}
          placeholder="Frecuencia min"
        />
        <Input
          type="number"
          className="h-10"
          value={String(toleranciaMinutos)}
          onChange={(e) => setToleranciaMinutos(Number(e.target.value))}
          placeholder="Tolerancia min"
        />
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

      <Button type="submit" className="h-10" disabled={saving || !templateId || !diasSemana.length}>
        {saving ? "Guardando..." : "Crear programación"}
      </Button>
    </form>
  );
}
