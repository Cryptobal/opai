"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Save, X, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  HubSectionMeta,
  HubSectionKey,
} from "../_lib/hub-sections-registry";

interface Props {
  orderedSections: HubSectionMeta[];
  hiddenSections: HubSectionMeta[];
  onClose: () => void;
}

export function HubCustomizeBar({ orderedSections, hiddenSections, onClose }: Props) {
  const [visible, setVisible] = useState<HubSectionMeta[]>(orderedSections);
  const [hidden, setHidden] = useState<HubSectionMeta[]>(hiddenSections);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setVisible((items) => {
      const oldIndex = items.findIndex((i) => i.key === active.id);
      const newIndex = items.findIndex((i) => i.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const hideSection = (key: HubSectionKey) => {
    const section = visible.find((i) => i.key === key);
    if (!section) return;
    setVisible((items) => items.filter((i) => i.key !== key));
    setHidden((h) => [...h, section]);
  };

  const showSection = (key: HubSectionKey) => {
    const section = hidden.find((i) => i.key === key);
    if (!section) return;
    setHidden((items) => items.filter((i) => i.key !== key));
    setVisible((v) => [...v, section]);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/preferences/hub-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: visible.map((s) => s.key),
          hidden: hidden.map((s) => s.key),
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      toast.success("Inicio personalizado");
      window.location.reload();
    } catch {
      toast.error("No se pudo guardar la personalización");
      setSaving(false);
    }
  }, [visible, hidden]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/preferences/hub-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [], hidden: [] }),
      });
      if (!res.ok) throw new Error("reset_failed");
      toast.success("Orden restablecido al original");
      window.location.reload();
    } catch {
      toast.error("No se pudo restablecer");
      setSaving(false);
    }
  }, []);

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Personalizar Inicio</h2>
          <p className="text-xs text-muted-foreground">
            Arrastra para reordenar, oculta lo que no uses. Los cambios se aplican al guardar.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {visible.map((section) => (
              <SortableSectionRow
                key={section.key}
                section={section}
                onHide={() => hideSection(section.key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {hidden.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Ocultas</p>
          {hidden.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.key}
                className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-muted-foreground">{section.label}</span>
                <button
                  type="button"
                  onClick={() => showSection(section.key)}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  aria-label={`Mostrar ${section.label}`}
                >
                  <EyeOff className="h-4 w-4" />
                  Mostrar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
          <RotateCcw className="mr-1 h-4 w-4" /> Restablecer al original
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  section: HubSectionMeta;
  onHide: () => void;
}

function SortableSectionRow({ section, onHide }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.key });
  const Icon = section.icon;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing flex-shrink-0 touch-none"
        aria-label={`Arrastrar ${section.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium truncate">{section.label}</span>
      <button
        type="button"
        onClick={onHide}
        className="text-muted-foreground hover:text-foreground transition-colors p-1"
        aria-label={`Ocultar ${section.label}`}
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  );
}
