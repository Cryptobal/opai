"use client";

import type { SummaryLine } from "@/modules/crm/email/thread-summary-format";

/** "hace 5 min" / "hace 3 h" / "hace 2 d" a partir de un ISO. */
export function relativeGeneratedAt(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

/** Viñetas del resumen del hilo (mismo render en Copiloto y en el lector). */
export function SummaryBullets({ lines }: { lines: SummaryLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((line, i) => (
        <li
          key={`${i}-${line.text.slice(0, 24)}`}
          className="flex gap-2 text-[13px] leading-5 text-ds-text-2"
        >
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ds-text-3" aria-hidden />
          <span className={line.emphasis ? "font-medium text-ds-text-1" : undefined}>
            {line.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Bloque de carga del resumen (shimmer). Respeta prefers-reduced-motion. */
export function SummarySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Generando resumen">
      <div className="h-2.5 w-11/12 animate-pulse rounded bg-ds-surface-3 motion-reduce:animate-none" />
      <div className="h-2.5 w-9/12 animate-pulse rounded bg-ds-surface-3 motion-reduce:animate-none" />
      <div className="h-2.5 w-7/12 animate-pulse rounded bg-ds-surface-3 motion-reduce:animate-none" />
    </div>
  );
}
