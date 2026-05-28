"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CellStatusPill } from "@/components/finance/cashflow/CellStatusPill";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import type { OccMeta } from "./projection-helpers";
import { MovementRow } from "./MovementRow";

interface Props {
  label: string;
  totalClp: number;
  items: VirtualOccurrence[];
  meta: Map<string, OccMeta>;
  canManage: boolean;
  onMove?: (occurrence: VirtualOccurrence) => void;
  onMoveDir?: (occurrence: VirtualOccurrence, dir: "left" | "right") => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
}

/**
 * Línea consolidada de una sección (ej. "Turnos extra"): resume decenas de
 * occurrences repartidas por instalación/guardia en una sola fila con total y
 * contador. El chevron expande el desglose individual (MovementRow). Colapsada
 * por defecto. Los consolidables son proyección ⇒ pill PROJECTED en el resumen.
 */
export function GroupRow({
  label,
  totalClp,
  items,
  meta,
  canManage,
  onMove,
  onMoveDir,
  canMoveLeft,
  canMoveRight,
  onOpenDetail,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 py-1.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-ds-text-3 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate text-[13px] font-medium text-ds-text-1">
            {label}
          </span>
          <span className="font-mono text-[12px] text-ds-text-3">
            {items.length}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[13px] tabular-nums text-ds-text-1">
            {fmtCLP.format(totalClp)}
          </span>
          <CellStatusPill variant="PROJECTED" compact />
        </span>
      </button>
      {open && (
        <div className="divide-y divide-ds-border-subtle border-t border-ds-border-subtle pl-6">
          {items.map((o, i) => (
            <MovementRow
              key={o.id ?? `g-${i}`}
              occurrence={o}
              meta={o.id ? meta.get(o.id) : undefined}
              canManage={canManage}
              onMove={onMove}
              onMoveDir={onMoveDir}
              canMoveLeft={canMoveLeft}
              canMoveRight={canMoveRight}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}
