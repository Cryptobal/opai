"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CheckpointOption {
  id: string;
  name: string;
}

export interface RondaTemplatePayload {
  installationId: string;
  name: string;
  description?: string;
  orderMode: "strict" | "flexible";
  estimatedDurationMin?: number;
  checkpointIds: string[];
}

export function RondaTemplateForm({
  installationId,
  checkpoints,
  onSubmit,
}: {
  installationId: string;
  checkpoints: CheckpointOption[];
  onSubmit: (payload: RondaTemplatePayload) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orderMode, setOrderMode] = useState<"strict" | "flexible">("flexible");
  const [estimatedDurationMin, setEstimatedDurationMin] = useState("60");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!selected.length) return;
        setSaving(true);
        try {
          await onSubmit({
            installationId,
            name,
            description: description || undefined,
            orderMode,
            estimatedDurationMin: estimatedDurationMin ? Number(estimatedDurationMin) : undefined,
            checkpointIds: selected,
          });
          setName("");
          setDescription("");
          setSelected([]);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre plantilla" className="h-10" />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" className="h-10" />
        <select
          value={orderMode}
          onChange={(e) => setOrderMode(e.target.value as "strict" | "flexible")}
          className="h-10 rounded border border-border bg-background px-2 text-sm"
        >
          <option value="flexible">Orden flexible</option>
          <option value="strict">Orden estricto</option>
        </select>
        <Input
          value={estimatedDurationMin}
          onChange={(e) => setEstimatedDurationMin(e.target.value)}
          placeholder="Duración (min)"
          className="h-10"
          type="number"
        />
      </div>

      <div className="rounded border border-border p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {checkpoints.map((cp) => (
          <label key={cp.id} className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(cp.id)}
              onChange={(e) =>
                setSelected((prev) => e.target.checked ? [...prev, cp.id] : prev.filter((id) => id !== cp.id))
              }
            />
            {cp.name}
          </label>
        ))}
      </div>

      <Button type="submit" className="h-10" disabled={saving || !selected.length}>
        {saving ? "Guardando..." : "Crear plantilla"}
      </Button>
    </form>
  );
}
