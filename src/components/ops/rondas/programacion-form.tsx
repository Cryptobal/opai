"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";

export interface ProgramacionPayload {
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  toleranciaMinutos: number;
}

const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

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

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card/50 p-4"
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
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Clock className="h-4 w-4 text-primary" />
        Nueva programación
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plantilla">Plantilla</Label>
          <Select value={templateId} onValueChange={setTemplateId} required>
            <SelectTrigger id="plantilla" className="h-9">
              <SelectValue placeholder="Selecciona plantilla" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hora-inicio">Hora inicio</Label>
          <Input
            id="hora-inicio"
            type="time"
            className="h-9"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hora-fin">Hora fin</Label>
          <Input
            id="hora-fin"
            type="time"
            className="h-9"
            value={horaFin}
            onChange={(e) => setHoraFin(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="frecuencia">Frecuencia (min)</Label>
          <Input
            id="frecuencia"
            type="number"
            min={5}
            max={360}
            className="h-9"
            value={String(frecuenciaMinutos)}
            onChange={(e) => setFrecuenciaMinutos(Number(e.target.value) || 120)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tolerancia">Tolerancia (min)</Label>
          <Input
            id="tolerancia"
            type="number"
            min={0}
            max={120}
            className="h-9"
            value={String(toleranciaMinutos)}
            onChange={(e) => setToleranciaMinutos(Number(e.target.value) || 10)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Días de la semana</Label>
        <div className="flex gap-1.5">
          {DAY_LABELS.map((lbl, idx) => (
            <button
              key={lbl}
              type="button"
              className={`h-9 w-9 rounded-md text-xs font-medium border transition-colors ${
                diasSemana.includes(idx)
                  ? "bg-primary/20 border-primary text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
              }`}
              onClick={() =>
                setDiasSemana((prev) =>
                  prev.includes(idx)
                    ? prev.filter((d) => d !== idx)
                    : [...prev, idx].sort((a, b) => a - b)
                )
              }
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        className="h-9"
        disabled={saving || !templateId || !diasSemana.length}
      >
        {saving ? "Guardando..." : "Crear programación"}
      </Button>
    </form>
  );
}
