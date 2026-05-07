"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HierarchicalSection {
  id: string;
  label: string;
  total: number;
  prevTotal?: number;
  accent?: string;
  collapsedByDefault?: boolean;
  items: Array<{
    id: string;
    label: string;
    sublabel?: string;
    amount: number;
    prevAmount?: number;
    onClick?: () => void;
  }>;
}

interface Props {
  sections: HierarchicalSection[];
  showComparison: boolean;
  fmt: (n: number) => string;
  fmtDelta?: (curr: number, prev: number) => string;
  /** Filas resumen "summary" extra al pie (ej. EBITDA). */
  summaryRows?: Array<{
    id: string;
    label: string;
    value: number;
    prev?: number;
    accent: string;
    big?: boolean;
  }>;
}

const defaultDelta = (curr: number, prev: number): string => {
  if (!prev) return curr ? "+100%" : "0%";
  const v = ((curr - prev) / Math.abs(prev)) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};

export function HierarchicalTable({
  sections,
  showComparison,
  fmt,
  fmtDelta = defaultDelta,
  summaryRows = [],
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    sections.forEach((s) => (o[s.id] = !s.collapsedByDefault));
    return o;
  });

  return (
    <div className="rounded-xl border bg-ds-surface overflow-hidden" style={{ borderColor: "var(--ds-border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] tabular-nums">
          <thead>
            <tr style={{ background: "var(--ds-bg-2)" }}>
              <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                Cuenta
              </th>
              {showComparison && (
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                  Per. anterior
                </th>
              )}
              <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                Período
              </th>
              {showComparison && (
                <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                  Δ%
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const expanded = open[sec.id] ?? true;
              return (
                <RenderSection
                  key={sec.id}
                  section={sec}
                  expanded={expanded}
                  onToggle={() => setOpen((o) => ({ ...o, [sec.id]: !expanded }))}
                  showComparison={showComparison}
                  fmt={fmt}
                  fmtDelta={fmtDelta}
                />
              );
            })}
            {summaryRows.map((sr) => (
              <tr
                key={sr.id}
                className="border-t"
                style={{ background: `color-mix(in oklab, ${sr.accent} 10%, transparent)`, borderColor: "var(--ds-border)" }}
              >
                <td
                  className={cn(
                    "px-3 py-2 font-semibold uppercase tracking-wider",
                    sr.big ? "text-[14px]" : "text-[12px]"
                  )}
                  style={{ color: sr.accent }}
                >
                  {sr.label}
                </td>
                {showComparison && (
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: sr.accent }}>
                    {sr.prev !== undefined ? fmt(sr.prev) : ""}
                  </td>
                )}
                <td
                  className={cn("px-3 py-2 text-right font-bold", sr.big ? "text-[14px]" : "text-[12.5px]")}
                  style={{ color: sr.accent }}
                >
                  {fmt(sr.value)}
                </td>
                {showComparison && (
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: sr.accent }}>
                    {sr.prev !== undefined ? fmtDelta(sr.value, sr.prev) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RenderSection({
  section,
  expanded,
  onToggle,
  showComparison,
  fmt,
  fmtDelta,
}: {
  section: HierarchicalSection;
  expanded: boolean;
  onToggle: () => void;
  showComparison: boolean;
  fmt: (n: number) => string;
  fmtDelta: (curr: number, prev: number) => string;
}) {
  const accent = section.accent ?? "var(--ds-tint-sky)";
  return (
    <>
      <tr
        className="border-t cursor-pointer hover:bg-ds-bg-2/40"
        style={{ borderColor: "var(--ds-border-soft)" }}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2 font-semibold" style={{ color: accent }}>
            <ChevronRight
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            {section.label}
          </div>
        </td>
        {showComparison && (
          <td className="px-3 py-2.5 text-right font-semibold" style={{ color: accent }}>
            {section.prevTotal !== undefined ? fmt(section.prevTotal) : ""}
          </td>
        )}
        <td className="px-3 py-2.5 text-right font-semibold" style={{ color: accent }}>
          {fmt(section.total)}
        </td>
        {showComparison && (
          <td className="px-3 py-2.5 text-right font-semibold" style={{ color: accent }}>
            {section.prevTotal !== undefined ? fmtDelta(section.total, section.prevTotal) : "—"}
          </td>
        )}
      </tr>
      {expanded &&
        section.items.map((it) => (
          <tr
            key={it.id}
            className="border-t"
            style={{ borderColor: "var(--ds-border-soft)" }}
            onClick={(e) => {
              e.stopPropagation();
              it.onClick?.();
            }}
          >
            <td className="px-3 py-2 pl-10">
              <p className="text-ds-text-1">{it.label}</p>
              {it.sublabel && <p className="text-[10.5px] text-ds-text-4">{it.sublabel}</p>}
            </td>
            {showComparison && (
              <td className="px-3 py-2 text-right text-ds-text-2">
                {it.prevAmount !== undefined ? fmt(it.prevAmount) : ""}
              </td>
            )}
            <td className="px-3 py-2 text-right text-ds-text-1">{fmt(it.amount)}</td>
            {showComparison && (
              <td className="px-3 py-2 text-right text-ds-text-3">
                {it.prevAmount !== undefined ? fmtDelta(it.amount, it.prevAmount) : "—"}
              </td>
            )}
          </tr>
        ))}
    </>
  );
}

export type { ReactNode };
