"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CheckpointOption {
  id: string;
  name: string;
}

interface SelectedCheckpoint {
  id: string;
  name: string;
  isRequired: boolean;
}

export interface RondaTemplatePayload {
  installationId: string;
  name: string;
  description?: string;
  orderMode: "strict" | "flexible";
  estimatedDurationMin?: number;
  checkpointIds: string[];
}

function SortableItem({ cp, onToggleRequired, onRemove }: {
  cp: SelectedCheckpoint;
  onToggleRequired: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: cp.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5">
      <button type="button" className="cursor-grab touch-none text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-xs font-medium">{cp.name}</span>
      <button
        type="button"
        className={`text-[10px] rounded px-1.5 py-0.5 border ${cp.isRequired ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10" : "border-border text-muted-foreground"}`}
        onClick={onToggleRequired}
      >
        {cp.isRequired ? "Obligatorio" : "Opcional"}
      </button>
      <button type="button" className="text-xs text-red-500 hover:text-red-400" onClick={onRemove}>✕</button>
    </div>
  );
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
  const [estimatedDurationMin, setEstimatedDurationMin] = useState("");
  const [selected, setSelected] = useState<SelectedCheckpoint[]>([]);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelected((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  const toggleCheckpoint = (cp: CheckpointOption) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === cp.id);
      if (exists) return prev.filter((s) => s.id !== cp.id);
      return [...prev, { id: cp.id, name: cp.name, isRequired: true }];
    });
  };

  const calcDuration = () => {
    setEstimatedDurationMin(String(selected.length * 8));
  };

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
            checkpointIds: selected.map((s) => s.id),
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
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre plantilla" className="h-9" />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" className="h-9" />
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Modo de orden</label>
          <select
            value={orderMode}
            onChange={(e) => setOrderMode(e.target.value as "strict" | "flexible")}
            className="h-9 rounded border border-border bg-background px-2 text-sm"
          >
            <option value="flexible">Orden flexible</option>
            <option value="strict">Orden estricto (secuencial)</option>
          </select>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Flexible: checkpoints en cualquier orden. Secuencial: deben seguirse en orden.
          </p>
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Duración estimada (min)</label>
          <div className="flex gap-1">
            <Input
              value={estimatedDurationMin}
              onChange={(e) => setEstimatedDurationMin(e.target.value)}
              placeholder="Ej: 40"
              className="h-9 flex-1"
              type="number"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs shrink-0"
              onClick={calcDuration}
              title="Calcula automáticamente: 8 minutos por checkpoint"
            >
              Auto
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Tiempo aproximado en minutos. &quot;Auto&quot; calcula 8 min por checkpoint.
          </p>
        </div>
      </div>

      <div className="rounded border border-border p-2">
        <p className="text-xs text-muted-foreground mb-2">Selecciona checkpoints:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {checkpoints.map((cp) => (
            <label key={cp.id} className="text-xs flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.some((s) => s.id === cp.id)}
                onChange={() => toggleCheckpoint(cp)}
                className="rounded"
              />
              {cp.name}
            </label>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Orden de recorrido (arrastra para reordenar):</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={selected.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {selected.map((cp) => (
                <SortableItem
                  key={cp.id}
                  cp={cp}
                  onToggleRequired={() =>
                    setSelected((prev) =>
                      prev.map((s) => (s.id === cp.id ? { ...s, isRequired: !s.isRequired } : s)),
                    )
                  }
                  onRemove={() => setSelected((prev) => prev.filter((s) => s.id !== cp.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <Button type="submit" className="h-9" disabled={saving || !selected.length}>
        {saving ? "Guardando..." : "Crear plantilla"}
      </Button>
    </form>
  );
}
