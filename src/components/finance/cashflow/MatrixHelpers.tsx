"use client";
import type { ProjectionBucket, ProjectionRow } from "@/modules/finance/cashflow/types";

export const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function MatrixRow({ row }: { row: ProjectionRow }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-background p-2 truncate">{row.categoryName}</td>
      {row.values.map((v) => (
        <td key={v.bucketKey} className="p-2 text-right font-mono text-ds-text-2">
          {v.amount > 0 ? fmt.format(v.amount) : "—"}
        </td>
      ))}
      <td className="p-2 text-right font-mono bg-muted/20">{fmt.format(row.total)}</td>
    </tr>
  );
}

export function SectionHeader({
  label,
  colSpan,
  tone,
}: {
  label: string;
  colSpan: number;
  tone: "ok" | "warn";
}) {
  const cls =
    tone === "ok" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-warn-soft text-status-warn-fg";
  return (
    <tr className={cls}>
      <td colSpan={colSpan} className="p-1.5 text-[11px] font-mono uppercase tracking-wider sticky left-0 z-10">
        {label}
      </td>
    </tr>
  );
}

export function SubtotalRow({
  label,
  rows,
  buckets,
  tone,
}: {
  label: string;
  rows: ProjectionRow[];
  buckets: ProjectionBucket[];
  tone: "ok" | "warn";
}) {
  const totals = buckets.map((b) =>
    rows.reduce((s, r) => s + (r.values.find((v) => v.bucketKey === b.key)?.amount ?? 0), 0),
  );
  const grand = totals.reduce((s, x) => s + x, 0);
  const cls = tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <tr className="border-t border-border font-medium">
      <td className="sticky left-0 z-10 bg-background p-2">{label}</td>
      {totals.map((t, i) => (
        <td key={i} className={`p-2 text-right font-mono ${cls}`}>
          {fmt.format(t)}
        </td>
      ))}
      <td className={`p-2 text-right font-mono bg-muted/20 ${cls}`}>{fmt.format(grand)}</td>
    </tr>
  );
}
