"use client";

import { useState } from "react";
import {
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type {
  ProjectionBucket,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import type { OccMeta } from "./projection-helpers";
import { MovementRow } from "./MovementRow";

interface Props {
  bucket: ProjectionBucket;
  meta: Map<string, OccMeta>;
  canManage: boolean;
  onMove?: (occurrence: VirtualOccurrence) => void;
}

/** Detalle de la semana seleccionada: Entra (INCOME) / Sale (EXPENSE), cada
 *  sección colapsable con subtotal. */
export function WeekDetail({ bucket, meta, canManage, onMove }: Props) {
  const income = bucket.occurrences.filter((o) => o.kind === "INCOME");
  const expense = bucket.occurrences.filter((o) => o.kind === "EXPENSE");
  return (
    <div className="space-y-3">
      <Section
        title="Entra"
        tone="ok"
        icon={ArrowDownLeft}
        occurrences={income}
        meta={meta}
        canManage={canManage}
        onMove={onMove}
      />
      <Section
        title="Sale"
        tone="danger"
        icon={ArrowUpRight}
        occurrences={expense}
        meta={meta}
        canManage={canManage}
        onMove={onMove}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  tone: "ok" | "danger";
  icon: LucideIcon;
  occurrences: VirtualOccurrence[];
  meta: Map<string, OccMeta>;
  canManage: boolean;
  onMove?: (occurrence: VirtualOccurrence) => void;
}

function Section({
  title,
  tone,
  icon: Icon,
  occurrences,
  meta,
  canManage,
  onMove,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  const subtotal = occurrences.reduce((s, o) => s + o.amountClp, 0);
  const toneFg = tone === "ok" ? "text-status-ok-fg" : "text-status-danger-fg";
  return (
    <Surface padding="sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ds-text-3 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <Icon className={cn("h-4 w-4", toneFg)} />
          <span className="text-[13px] font-semibold text-ds-text-1">{title}</span>
          <span className="font-mono text-[12px] text-ds-text-3">
            {occurrences.length}
          </span>
        </span>
        <span className={cn("font-mono text-[13px] tabular-nums", toneFg)}>
          {fmtCLP.format(subtotal)}
        </span>
      </button>
      {open &&
        (occurrences.length > 0 ? (
          <div className="mt-1 divide-y divide-ds-border-subtle border-t border-ds-border-subtle">
            {occurrences.map((o, i) => (
              <MovementRow
                key={o.id ?? `v-${i}`}
                occurrence={o}
                meta={o.id ? meta.get(o.id) : undefined}
                canManage={canManage}
                onMove={onMove}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-ds-text-3">Sin movimientos.</p>
        ))}
    </Surface>
  );
}
