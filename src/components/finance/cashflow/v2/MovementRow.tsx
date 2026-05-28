"use client";

import { Lock, MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CellStatusPill,
  pillVariantFor,
} from "@/components/finance/cashflow/CellStatusPill";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import type { OccMeta } from "./projection-helpers";
import { FolioChip } from "./FolioChip";

interface Props {
  occurrence: VirtualOccurrence;
  meta?: OccMeta;
  canManage: boolean;
  /** Abre el selector de bucket destino. Wired en el bloque 0.4. */
  onMove?: (occurrence: VirtualOccurrence) => void;
}

/**
 * Fila de un movimiento del detalle de la semana. Conciliado (bankTransactionId
 * != null) ⇒ candado (fijo). Proyectado/borrador ⇒ botón mover. Muestra chips
 * de factoring/UF, folio de factura y el pill de estado.
 */
export function MovementRow({ occurrence: occ, meta, canManage, onMove }: Props) {
  const reconciled = occ.bankTransactionId != null;
  const title = occ.nickname || occ.name || occ.installationName || "Sin nombre";
  const factoring = occ.modoCobro === "FACTORING";
  const isUf = occ.currency === "UF";
  const cellStatus = meta?.cellStatus ?? (reconciled ? "PAID" : "PROJECTED");
  const variant = pillVariantFor({
    cellStatus,
    hasFactoring: factoring,
    daysOverdue: meta?.daysOverdue,
  });

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] text-ds-text-1">{title}</span>
          {factoring && (
            <span className="rounded-ds-sm bg-purple-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-purple-300">
              F
            </span>
          )}
          {isUf && (
            <span className="rounded-ds-sm bg-ds-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-ds-text-2">
              UF
            </span>
          )}
          <FolioChip
            folio={meta?.dteFolio}
            dteId={meta?.dteId}
            isDraft={cellStatus === "DRAFT"}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[13px] tabular-nums text-ds-text-1">
          {fmtCLP.format(occ.amountClp)}
        </span>
        <CellStatusPill variant={variant} compact />
        {reconciled ? (
          <Lock
            className="h-3.5 w-3.5 text-ds-text-3"
            aria-label="conciliado (fijo)"
          />
        ) : canManage ? (
          <button
            type="button"
            onClick={() => onMove?.(occ)}
            aria-label="Mover a otra semana"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-3",
              "hover:bg-ds-surface-3 hover:text-ds-text-1",
            )}
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
