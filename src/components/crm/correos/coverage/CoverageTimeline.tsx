"use client";

import type { CoverageStageGroup } from "./coverage-grouping";

const SWATCH_BAR = [
  "bg-tint-teal-fg/70",
  "bg-tint-sky-fg/70",
  "bg-tint-violet-fg/70",
  "bg-tint-amber-fg/70",
  "bg-tint-rose-fg/70",
  "bg-tint-emerald-fg/70",
] as const;

type Props = {
  groups: CoverageStageGroup[];
};

function parseMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function monthTicks(minMs: number, maxMs: number): Array<{ label: string; left: number }> {
  const ticks: Array<{ label: string; left: number }> = [];
  const start = new Date(minMs);
  start.setUTCDate(1);
  const range = Math.max(1, maxMs - minMs);
  for (
    let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    t <= maxMs;
    t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)
  ) {
    if (t < minMs) continue;
    const left = ((t - minMs) / range) * 100;
    const d = new Date(t);
    const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit", timeZone: "UTC" });
    ticks.push({ label, left });
  }
  return ticks.slice(0, 8);
}

/**
 * Mini-gantt por etapa. Solo se monta si hay ≥2 grupos con vigencia.
 */
export function CoverageTimeline({ groups }: Props) {
  const dated = groups.filter((g) => g.vigenciaDesde && g.vigenciaHasta);
  if (dated.length < 2) return null;

  const minMs = Math.min(...dated.map((g) => parseMs(g.vigenciaDesde!)));
  const maxMs = Math.max(...dated.map((g) => parseMs(g.vigenciaHasta!)));
  const range = Math.max(1, maxMs - minMs);
  const ticks = monthTicks(minMs, maxMs);

  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 space-y-2">
      <p className="text-[12px] font-medium text-ds-text-3">Timeline de etapas</p>
      <div className="relative h-3">
        {ticks.map((t) => (
          <span
            key={t.label + t.left}
            className="absolute top-0 -translate-x-1/2 text-[12px] text-ds-text-4"
            style={{ left: `${t.left}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <ul className="space-y-1.5">
        {groups.map((g, idx) => {
          if (!g.vigenciaDesde || !g.vigenciaHasta) return null;
          const from = parseMs(g.vigenciaDesde);
          const to = parseMs(g.vigenciaHasta);
          const left = ((from - minMs) / range) * 100;
          const width = Math.max(2, ((to - from) / range) * 100);
          const bar = SWATCH_BAR[idx % SWATCH_BAR.length];
          return (
            <li key={g.key} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[12px] text-ds-text-3">
                {g.label}
              </span>
              <div className="relative h-5 flex-1 rounded-md bg-ds-surface-3">
                <div
                  className={`absolute top-0.5 bottom-0.5 rounded ${bar}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${g.label}: ${g.vigenciaDesde} → ${g.vigenciaHasta} · ${g.subtotalHeadcount} dot`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
