/**
 * <PositionMatrix> — editor de puestos compartido entre CPQ y Lead.
 * Modo-agnóstico: toda la persistencia vive en el adapter (prop).
 */
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, LayoutTemplate } from "lucide-react";
import { ServiceCard } from "./ServiceCard";
import { COVERAGE_BUTTONS, templateSeedsFor } from "./shift-utils";
import type { NormalizedShift, PositionMatrixAdapter } from "./types";

interface Props {
  adapter: PositionMatrixAdapter;
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
          {sortedGroups.map((group) => (
            <ServiceCard
              key={group.key}
              group={group}
              rows={byGroup.get(group.key) ?? []}
              adapter={adapter}
              totalCost={totalCost}
              expandedRowId={expandedRowId}
              onToggleRow={toggleRow}
            />
          ))}

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
