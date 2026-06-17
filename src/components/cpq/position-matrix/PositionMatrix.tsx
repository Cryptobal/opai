/**
 * <PositionMatrix> — editor de puestos compartido entre CPQ y Lead.
 * Modo-agnóstico: toda la persistencia vive en el adapter (prop).
 */
"use client";

import { useEffect, useMemo, useState } from "react";
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
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Plus, LayoutTemplate, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceCard } from "./ServiceCard";
import { COVERAGE_BUTTONS, templateSeedsFor } from "./shift-utils";
import type { NormalizedGroup, NormalizedShift, PositionMatrixAdapter } from "./types";

interface Props {
  adapter: PositionMatrixAdapter;
}

interface SortableServiceCardProps {
  group: NormalizedGroup;
  rows: NormalizedShift[];
  adapter: PositionMatrixAdapter;
  totalCost: number;
  expandedRowId: string | null;
  onToggleRow: (id: string) => void;
}

function SortableServiceCard({ group, ...rest }: SortableServiceCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };
  const handle = (
    <button
      type="button"
      className="cursor-grab touch-none p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
      aria-label="Arrastrar para reordenar servicio"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-70")}>
      <ServiceCard group={group} {...rest} dragHandle={handle} />
    </div>
  );
}

export function PositionMatrix({ adapter }: Props) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const readOnly = adapter.readOnly;

  const toggleRow = (id: string) => setExpandedRowId((prev) => (prev === id ? null : id));

  const { byGroup, ungrouped } = useMemo(() => {
    const map = new Map<string, NormalizedShift[]>();
    const un: NormalizedShift[] = [];
    for (const r of adapter.rows) {
      if (!r.groupKey) {
        un.push(r);
        continue;
      }
      const list = map.get(r.groupKey) ?? [];
      list.push(r);
      map.set(r.groupKey, list);
    }
    return { byGroup: map, ungrouped: un };
  }, [adapter.rows]);

  const totalCost = useMemo(
    () => adapter.rows.reduce((s, r) => s + (r.costo ?? 0), 0),
    [adapter.rows]
  );

  const sortedGroups = useMemo(
    () => [...adapter.groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [adapter.groups]
  );

  // Orden local (optimista) para el drag & drop de servicios. Se re-sincroniza
  // cuando cambia el conjunto de grupos provisto por el adapter.
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => sortedGroups.map((g) => g.key));
  const sortedKeysSignature = sortedGroups.map((g) => g.key).join("|");
  useEffect(() => {
    setOrderedKeys(sortedGroups.map((g) => g.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedKeysSignature]);

  const groupByKey = useMemo(() => {
    const m = new Map<string, NormalizedGroup>();
    for (const g of sortedGroups) m.set(g.key, g);
    return m;
  }, [sortedGroups]);

  const orderedGroups = useMemo(
    () => orderedKeys.map((k) => groupByKey.get(k)).filter((g): g is NormalizedGroup => !!g),
    [orderedKeys, groupByKey]
  );

  const dndEnabled = !readOnly && !!adapter.onReorderGroups && orderedGroups.length > 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedKeys, oldIndex, newIndex);
    setOrderedKeys(next);
    adapter.onReorderGroups?.(next);
  };

  const handleTemplate = (patternId: string) => {
    const seeded = templateSeedsFor(patternId);
    if (seeded) adapter.onAddGroup(seeded.name, seeded.seeds);
    else adapter.onAddGroup("Servicio nuevo");
  };

  const isEmpty = adapter.rows.length === 0 && adapter.groups.length === 0;

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/10 px-2.5 py-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <LayoutTemplate className="h-3.5 w-3.5" /> Plantillas:
          </span>
          {COVERAGE_BUTTONS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => handleTemplate(p.id)}
              title={p.description}
            >
              {p.shortLabel}
            </Button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Sin puestos todavía. Usa una plantilla o crea un servicio para comenzar.
          </p>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" className="mt-3 h-9 gap-1" onClick={() => adapter.onAddGroup("Servicio nuevo")}>
              <Plus className="h-3.5 w-3.5" /> Nuevo servicio
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {dndEnabled ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleGroupDragEnd}
            >
              <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {orderedGroups.map((group) => (
                    <SortableServiceCard
                      key={group.key}
                      group={group}
                      rows={byGroup.get(group.key) ?? []}
                      adapter={adapter}
                      totalCost={totalCost}
                      expandedRowId={expandedRowId}
                      onToggleRow={toggleRow}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            orderedGroups.map((group) => (
              <ServiceCard
                key={group.key}
                group={group}
                rows={byGroup.get(group.key) ?? []}
                adapter={adapter}
                totalCost={totalCost}
                expandedRowId={expandedRowId}
                onToggleRow={toggleRow}
              />
            ))
          )}

          {ungrouped.length > 0 && (
            <ServiceCard
              group={null}
              rows={ungrouped}
              adapter={adapter}
              totalCost={totalCost}
              expandedRowId={expandedRowId}
              onToggleRow={toggleRow}
            />
          )}

          {!readOnly && (
            <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-1" onClick={() => adapter.onAddGroup("Servicio nuevo")}>
              <Plus className="h-3.5 w-3.5" /> Nuevo servicio
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
