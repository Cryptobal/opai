"use client";

import { HeatGrid } from "@/components/opai-ds";
import type {
  InstallationDetailGuard,
  InstallationDetailResult,
} from "@/lib/protocols/knowledge-aggregator-types";

function abbreviation(title: string): string {
  const word = title.split(/\s+/)[0] ?? title;
  return word.slice(0, 3).toUpperCase();
}

export function HeatmapMatrix({
  sections,
  guards,
}: {
  sections: InstallationDetailResult["protocol"]["sections"];
  guards: InstallationDetailGuard[];
}) {
  const rows = guards.map((g) => ({
    id: g.guardId,
    label: g.name,
  }));

  const columns = sections.map((s) => ({
    id: s.id,
    shortLabel: abbreviation(s.title),
    fullLabel: s.title,
  }));

  const guardById = new Map(guards.map((g) => [g.guardId, g]));

  return (
    <div className="px-3 pb-3">
      <HeatGrid
        rows={rows}
        columns={columns}
        rowHeaderLabel="guardia"
        getScore={(rowId, columnId) => {
          const g = guardById.get(rowId);
          if (!g) return null;
          return g.sectionScores[columnId] ?? null;
        }}
        emptyMessage="Aún no hay datos suficientes para el mapa de calor."
      />
    </div>
  );
}
