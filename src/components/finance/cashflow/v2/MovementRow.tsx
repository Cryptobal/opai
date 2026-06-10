"use client";

import type { KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Lock, MoveHorizontal, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CellStatusPill,
  pillVariantFor,
} from "@/components/finance/cashflow/CellStatusPill";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { canDeleteOccurrence, type OccMeta } from "./projection-helpers";
import { FolioChip } from "./FolioChip";

interface Props {
  occurrence: VirtualOccurrence;
  meta?: OccMeta;
  canManage: boolean;
  /** Legacy: abre el selector de bucket destino (fallback si no hay onMoveDir). */
  onMove?: (occurrence: VirtualOccurrence) => void;
  /** Mueve la occurrence al bucket vecino (anterior/siguiente). Si está
   *  definido, reemplaza a onMove con flechas ← →. */
  onMoveDir?: (occurrence: VirtualOccurrence, dir: "left" | "right") => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  /** Abre el detalle "qué es esto" de la fila. Si está definido, la fila es
   *  tappable (los botones internos hacen stopPropagation). */
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
  /** Borra la occurrence (solo si es weak: proyección sin DTE ni bank tx).
   *  Si no se define, el botón borrar no se muestra. */
  onDelete?: (occurrence: VirtualOccurrence) => void;
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
  onMoveDir,
  canMoveLeft,
  canMoveRight,
  onOpenDetail,
  onDelete,
}: Props) {
  const reconciled = occ.bankTransactionId != null;
  // Título "Cuenta / Nombre": primero el cliente CRM (crmAccountName), luego el
  // nombre manual del contrato (nickname) o, si no hay, la instalación. Antes el
  // nickname iba solo y tapaba la cuenta. Si el nombre coincide con la cuenta
  // (ej. "Pine / Pine") o no hay cuenta, se muestra solo lo disponible.
  const account = occ.crmAccountName?.trim();
  const loc = (occ.nickname || occ.installationName || "").trim();
  const title =
    account && loc && loc.toLowerCase() !== account.toLowerCase()
      ? `${account} / ${loc}`
      : account || loc || occ.name || "Sin nombre";
  const factoring = occ.modoCobro === "FACTORING";
  const isUf = occ.currency === "UF";
  // Etapa: el motor stampa cellStatus/dteFolio en la occurrence a nivel de celda
  // (refleja el DTE de la celda aunque la fila visible sea la proyección). meta
  // queda como fallback para vistas que no pasan la occurrence enriquecida.
  const cellStatus =
    occ.cellStatus ?? meta?.cellStatus ?? (reconciled ? "PAID" : "PROJECTED");
  const folio = occ.dteFolio ?? meta?.dteFolio;
  const variant = pillVariantFor({
    cellStatus,
    hasFactoring: factoring,
    factoringCollected: occ.factoringCollected,
    daysOverdue: occ.daysOverdue ?? meta?.daysOverdue,
  });
  // Real = ya existe como hecho (conciliada, pagada, emitida, o con folio). El
  // resto (proyección/borrador) se atenúa para distinguir lo cierto de lo
  // estimado de un vistazo.
  const isReal =
    reconciled ||
    cellStatus === "PAID" ||
    cellStatus === "INVOICED" ||
    cellStatus === "CEDED" ||
    folio != null;
  const emphasis = isReal ? "text-ds-text-1" : "text-ds-text-2";
  const tappable = !!onOpenDetail;
  const open = () => onOpenDetail?.(occ, meta);

  return (
    <div
      className={cn(
        // Dos líneas para que el nombre largo "Cuenta / Nombre" no pelee espacio
        // con el monto y las flechas en columnas angostas (kanban desktop):
        //   Línea 1 = nombre (truncate) + monto, lo importante junto.
        //   Línea 2 = chips (F/UF/folio) + estado + acciones, atenuado.
        "flex min-h-[44px] flex-col gap-0.5 py-2",
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
      {/* Línea 1: Cuenta / Nombre + monto */}
      <div className="flex items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", emphasis)}>
          {title}
        </span>
        {occ.notes && (
          <span
            title={occ.notes}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-status-warn-soft p-0.5 text-status-warn-fg"
            aria-label="Tiene notas"
          >
            <StickyNote className="h-2.5 w-2.5" />
          </span>
        )}
        <span className={cn("shrink-0 font-mono text-[13px] tabular-nums", emphasis)}>
          {fmtCLP.format(occ.amountClp)}
        </span>
      </div>

      {/* Línea 2: etapa del ciclo (Programada/Borrador/Facturada/Factorizada) +
          folio · UF · acciones. El factoring ya no es un chip suelto: se integra
          como etapa "Factorizada" en el pill. */}
      <div className="flex items-center gap-1.5">
        <CellStatusPill variant={variant} />
        <FolioChip folio={folio} dteId={occ.dteId ?? meta?.dteId} />
        {isUf && (
          <span className="rounded-ds-sm bg-ds-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
            UF
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
        {reconciled ? (
          <Lock
            className="h-3.5 w-3.5 text-ds-text-3"
            aria-label="conciliado (fijo)"
          />
        ) : canManage && onMoveDir ? (
          <div className="flex items-center">
            <button
              type="button"
              disabled={!canMoveLeft}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDir(occ, "left");
              }}
              aria-label="Mover a la semana anterior"
              className={cn(
                "inline-flex h-9 w-8 items-center justify-center rounded-ds-sm text-ds-text-3 transition-all",
                canMoveLeft
                  ? "hover:bg-ds-surface-3 hover:text-ds-text-1 active:scale-90"
                  : "opacity-25",
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canMoveRight}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDir(occ, "right");
              }}
              aria-label="Mover a la semana siguiente"
              className={cn(
                "inline-flex h-9 w-8 items-center justify-center rounded-ds-sm text-ds-text-3 transition-all",
                canMoveRight
                  ? "hover:bg-ds-surface-3 hover:text-ds-text-1 active:scale-90"
                  : "opacity-25",
              )}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : canManage && onMove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(occ);
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
        {onDelete && canManage && canDeleteOccurrence(occ) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(occ); }}
            className="rounded-md p-1.5 transition-all hover:bg-status-danger-soft active:scale-90"
            aria-label="Borrar proyección"
            title="Borrar esta proyección"
          >
            <Trash2 className="h-3.5 w-3.5 text-status-danger-fg/70 hover:text-status-danger-fg" />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
