"use client";

import Link from "next/link";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type {
  FinanceCashflowItemSource,
  ProjectionBucket,
} from "@/modules/finance/cashflow/types";
import type { BucketMeta } from "./grid-helpers";
import { programacionHrefForCashflowItem } from "./programacion-link";

export interface WeekTarget {
  key: string;
  label: string;
}

/** Semanas abiertas de la ventana visible, excluyendo `currentKey`. */
export function openWeekTargets(
  buckets: ProjectionBucket[],
  bucketMeta: Map<string, BucketMeta> | undefined,
  currentKey: string,
): WeekTarget[] {
  return buckets
    .filter((b) => b.key !== currentKey && !(bucketMeta?.get(b.key)?.closed))
    .map((b) => ({ key: b.key, label: b.label }));
}

/**
 * Menú contextual de celda (click derecho / long-press). Header de contexto +
 * acciones según estado. ≤150 líneas; el type-ahead de "otro concepto" → F3.
 */
export function CellContextMenu({
  children,
  itemName,
  weekLabel,
  amount,
  statusTitle,
  kindLabel,
  empty,
  closed,
  locked,
  canEdit,
  canHide,
  canMove,
  dteId,
  dteFolio,
  source,
  itemId,
  openWeeks,
  onAddHere,
  onEdit,
  onMoveTo,
  onDuplicateTo,
  onOpenDetail,
  onHide,
}: {
  children: React.ReactNode;
  itemName: string;
  weekLabel: string;
  amount: number;
  statusTitle: string;
  kindLabel: string;
  empty: boolean;
  closed: boolean;
  locked: boolean;
  canEdit: boolean;
  canHide: boolean;
  canMove: boolean;
  dteId?: string | null;
  dteFolio?: number | null;
  source?: FinanceCashflowItemSource | null;
  itemId?: string | null;
  openWeeks: WeekTarget[];
  onAddHere: () => void;
  onEdit: () => void;
  onMoveTo: (bucketKey: string) => void;
  onDuplicateTo: (bucketKey: string) => void;
  onOpenDetail: () => void;
  onHide: () => void;
}) {
  const programacionHref = programacionHrefForCashflowItem(source, itemId);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[220px]">
        <ContextMenuLabel className="max-w-[260px] space-y-0.5 font-normal leading-snug">
          <div className="truncate font-semibold text-ds-text-1">{itemName}</div>
          <div className="font-mono text-[12px] text-ds-text-3">
            {weekLabel}
            {amount !== 0 ? ` · ${fmt.format(amount)}` : ""} · {statusTitle}
          </div>
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {closed ? (
          <ContextMenuItem disabled>
            Semana cerrada — reabrir desde el candado
          </ContextMenuItem>
        ) : empty ? (
          <>
            <ContextMenuItem onSelect={onAddHere}>
              Agregar {kindLabel} aquí
            </ContextMenuItem>
            <ContextMenuItem disabled title="Type-ahead de concepto en F3">
              Agregar otro concepto en {weekLabel}… {/* TODO F3 AddConceptRow */}
            </ContextMenuItem>
          </>
        ) : locked ? (
          <>
            {dteId && (
              <ContextMenuItem asChild>
                <Link href={`/finanzas/facturacion/dtes?dte=${dteId}`}>
                  Ver factura{dteFolio != null ? ` N° ${dteFolio}` : ""}
                </Link>
              </ContextMenuItem>
            )}
            {programacionHref && (
              <ContextMenuItem asChild>
                <Link href={programacionHref}>Ver programación</Link>
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={onOpenDetail}>Ver detalle e historial</ContextMenuItem>
            <ContextMenuItem disabled>
              Conciliada — monto fijado por el banco
            </ContextMenuItem>
          </>
        ) : (
          <>
            {canEdit && (
              <ContextMenuItem onSelect={onEdit}>Editar monto</ContextMenuItem>
            )}
            {canMove && openWeeks.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>Mover a semana</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {openWeeks.map((w) => (
                    <ContextMenuItem key={w.key} onSelect={() => onMoveTo(w.key)}>
                      {w.label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {openWeeks.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>Duplicar en otra semana</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {openWeeks.map((w) => (
                    <ContextMenuItem
                      key={w.key}
                      onSelect={() => onDuplicateTo(w.key)}
                    >
                      {w.label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {dteId && (
              <ContextMenuItem asChild>
                <Link href={`/finanzas/facturacion/dtes?dte=${dteId}`}>
                  Ver factura{dteFolio != null ? ` N° ${dteFolio}` : ""}
                </Link>
              </ContextMenuItem>
            )}
            {programacionHref && (
              <ContextMenuItem asChild>
                <Link href={programacionHref}>Ver programación</Link>
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={onOpenDetail}>Ver detalle e historial</ContextMenuItem>
            {canHide && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={onHide}
                  className="text-status-danger-fg focus:text-status-danger-fg"
                >
                  Ocultar del flujo
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
