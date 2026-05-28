"use client";

import type { KeyboardEvent } from "react";
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
  /** Abre el detalle "qué es esto" de la fila. Si está definido, la fila es
   *  tappable (los botones internos hacen stopPropagation). */
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
}

/**
 * Fila de un movimiento del detalle de la semana. Conciliado (bankTransactionId
 * != null) ⇒ candado (fijo). Proyectado/borrador ⇒ botón mover. Muestra chips
 * de factoring/UF, folio de factura y el pill de estado. Las facturas reales
 * (pagada/emitida/con folio) se resaltan; las proyecciones/borradores se
 * atenúan. La fila completa abre el detalle al tocarla.
 */
export function MovementRow({
  occurrence: occ,
  meta,
  canManage,
  onMove,
  onOpenDetail,
}: Props) {
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
  // Real = ya existe como hecho (conciliada, pagada, emitida, o con folio). El
  // resto (proyección/borrador) se atenúa para distinguir lo cierto de lo
  // estimado de un vistazo.
  const isReal =
    reconciled ||
    cellStatus === "PAID" ||
    cellStatus === "INVOICED" ||
    meta?.dteFolio != null;
  const emphasis = isReal ? "text-ds-text-1" : "text-ds-text-2";
  const tappable = !!onOpenDetail;
  const open = () => onOpenDetail?.(occ, meta);

  return (
    <div
      className={cn(
        "flex min-h-[44px] items-center gap-2 py-1.5",
        tappable &&
          "cursor-pointer rounded-ds-sm transition-colors hover:bg-ds-surface-2",
      )}
      {...(tappable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: open,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            },
          }
        : {})}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("truncate text-[13px]", emphasis)}>{title}</span>
          {factoring && (
            <span className="rounded-ds-sm bg-purple-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-purple-300">
              F
            </span>
          )}
          {isUf && (
            <span className="rounded-ds-sm bg-ds-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
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
        <span className={cn("font-mono text-[13px] tabular-nums", emphasis)}>
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
            onClick={(e) => {
              e.stopPropagation();
              onMove?.(occ);
            }}
            aria-label="Mover a otra semana"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-ds-sm text-ds-text-3",
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
