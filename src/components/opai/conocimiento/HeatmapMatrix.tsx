"use client";

import { HeatmapCell } from "./_primitives";
import type {
  InstallationDetailGuard,
  InstallationDetailResult,
} from "@/lib/protocols/knowledge-aggregator-types";

function abbreviation(title: string): string {
  const word = title.split(/\s+/)[0] ?? title;
  return word.slice(0, 3);
}

export function HeatmapMatrix({
  sections,
  guards,
}: {
  sections: InstallationDetailResult["protocol"]["sections"];
  guards: InstallationDetailGuard[];
}) {
  if (!sections.length || !guards.length) {
    return (
      <div className="text-[11px] text-white/40 px-3 py-4 text-center">
        Aún no hay datos suficientes para el mapa de calor.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="overflow-x-auto scrollbar-none">
        <table className="text-[10px] font-mono">
          <thead>
            <tr>
              <th className="text-left w-32 pb-1.5 text-white/40 font-normal">
                guardia
              </th>
              {sections.map((s) => (
                <th
                  key={s.id}
                  className="px-1 pb-1.5 text-white/40 font-normal text-center min-w-7"
                  title={s.title}
                >
                  {abbreviation(s.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guards.map((g) => (
              <tr key={g.guardId}>
                <td className="pr-2 py-1 text-white/70 truncate max-w-32">
                  {g.name}
                </td>
                {sections.map((s) => (
                  <td key={s.id} className="px-1 py-1">
                    <HeatmapCell score={g.sectionScores[s.id] ?? null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* leyenda */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/40 font-mono">
        <span className="flex items-center gap-1">
          <span className="hm-cell w-3 inline-block bg-emerald-500/80" />
          ≥80%
        </span>
        <span className="flex items-center gap-1">
          <span className="hm-cell w-3 inline-block bg-amber-500/80" />
          60–79%
        </span>
        <span className="flex items-center gap-1">
          <span className="hm-cell w-3 inline-block bg-red-500/80" />
          &lt;60%
        </span>
        <span className="flex items-center gap-1">
          <span className="hm-cell w-3 inline-block bg-white/5" />
          sin eval.
        </span>
      </div>
    </div>
  );
}
