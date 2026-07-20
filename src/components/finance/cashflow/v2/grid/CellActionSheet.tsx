"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, EyeOff, FileText, Loader2, CalendarDays } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CellStatusPill } from "@/components/finance/cashflow/CellStatusPill";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { hideFromFlowViaApi, type HideInput } from "./cashflow-hide";
import type { HideUndoPayload } from "./CellFlowActions";
import type { WeekTarget } from "./CellContextMenu";
import { CellHistory } from "./CellHistory";
import { GestionGlyphs } from "./GestionGlyphs";
import { programacionHrefForCashflowItem } from "./programacion-link";
import type {
  CashflowCellStatus,
  CellGestionSummary,
  FinanceCashflowItemSource,
} from "@/modules/finance/cashflow/types";
import type { DraftProformaStatus } from "@/modules/finance/billing/dte-draft.service";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemName: string;
  weekLabel: string;
  amount: number;
  actualAmount: number | null;
  variant: PillVariant;
  statusTitle: string;
  dteId: string | null;
  dteFolio: number | null;
  /** Editar el monto (solo egresos editables + semana abierta). */
  canEdit: boolean;
  onEdit: () => void;
  /** Ocultar del flujo (factura o programación). */
  canHide: boolean;
  hideTarget: HideInput;
  onHidden: (undo: HideUndoPayload) => void;
  /** Best-effort historial (F3). */
  source?: FinanceCashflowItemSource | null;
  hasAmountOverride?: boolean;
  scheduledDate?: string | null;
  bucketStart?: string | Date | null;
  /** Gestión de cobro (proforma/EP/OC) de la celda — bloque informativo. */
  gestion?: CellGestionSummary | null;
  emiteProforma?: boolean;
  /** Semanas abiertas destino para "Mover a" (excluye la actual). */
  openWeeks?: WeekTarget[];
  currentBucketKey?: string;
  /** Mueve la cuota a otra semana — MISMA vía que el menú contextual
   *  (onContextMove → useGridMove, con conflicto y undo). */
  onMoveTo?: (bucketKey: string) => void;
  /** Habilita "Mover a" (misma condición que el drag: canDrag). */
  canMove?: boolean;
  /** La cuota de la celda es la proyección pura que quedó junto a una factura
   *  (collidesWithInvoice, sin dteId): ofrece "Quitar programación duplicada". */
  isDupProjection?: boolean;
}

/**
 * Sheet de acciones al tocar una celda con movimiento. Centraliza en un solo
 * lugar lo que antes estaba disperso (doble-clic para editar, ojo al hover para
 * ocultar): ver detalle, editar monto, mover a otra semana en un toque
 * (paridad móvil con el menú contextual), ocultar del flujo y ver la factura.
 */
export function CellActionSheet({
  open,
  onOpenChange,
  itemName,
  weekLabel,
  amount,
  actualAmount,
  variant,
  statusTitle,
  dteId,
  dteFolio,
  canEdit,
  onEdit,
  canHide,
  hideTarget,
  onHidden,
  source,
  hasAmountOverride,
  scheduledDate,
  bucketStart,
  gestion,
  emiteProforma = false,
  openWeeks = [],
  onMoveTo,
  canMove = false,
  isDupProjection = false,
}: Props) {
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const programacionHref = programacionHrefForCashflowItem(
    source,
    hideTarget.itemId,
  );

  async function doHide(successLabel?: string) {
    setBusy(true);
    const res = await hideFromFlowViaApi(hideTarget);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo ocultar");
      return;
    }
    onOpenChange(false);
    setConfirmingHide(false);
    onHidden({
      label: hideTarget.label,
      dteId: hideTarget.dteId,
      occurrenceId: res.occurrenceId ?? hideTarget.occurrenceId,
      ...(successLabel ? { successLabel } : {}),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirmingHide(false);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <CellStatusPill variant={variant} />
          <SheetTitle className="text-[15px] leading-snug">{itemName}</SheetTitle>
        </SheetHeader>

        <dl className="mt-4 space-y-3 text-[13px]">
          <Row label="Estado" value={statusTitle} />
          <Row label="Semana" value={weekLabel} />
          <Row label="Monto" value={fmt.format(amount)} mono />
          {actualAmount != null && (
            <Row label="Real (banco)" value={fmt.format(actualAmount)} mono />
          )}
          {dteFolio != null && <Row label="Factura" value={`N° ${dteFolio}`} />}
        </dl>

        <GestionSection
          gestion={gestion ?? null}
          emiteProforma={emiteProforma}
          cellStatus={variantToCellStatus(variant)}
        />

        <CellHistory
          source={source}
          hasAmountOverride={hasAmountOverride}
          scheduledDate={scheduledDate}
          bucketStart={bucketStart}
        />

        <div className="mt-5 space-y-2 border-t border-ds-border-subtle pt-4">
          {isDupProjection && canHide && (
            <Button
              variant="outline"
              className="h-11 w-full justify-start border-status-danger-border text-[13px] text-status-danger-fg hover:bg-status-danger-soft sm:h-10"
              disabled={busy}
              onClick={() =>
                void doHide(
                  "Programación duplicada quitada — queda solo la factura",
                )
              }
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              Quitar programación duplicada (ya está facturada)
            </Button>
          )}

          {canEdit && (
            <Button
              variant="outline"
              className="h-11 w-full justify-start text-[13px] sm:h-10"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Editar monto
            </Button>
          )}

          {dteId && (
            <Button
              asChild
              variant="outline"
              className="h-11 w-full justify-start text-[13px] sm:h-10"
            >
              <Link href={`/finanzas/facturacion/dtes?dte=${dteId}`}>
                <FileText className="mr-2 h-4 w-4" /> Ver factura
              </Link>
            </Button>
          )}

          {programacionHref && (
            <Button
              asChild
              variant="outline"
              className="h-11 w-full justify-start text-[13px] sm:h-10"
            >
              <Link href={programacionHref}>
                <CalendarDays className="mr-2 h-4 w-4" /> Ver programación
              </Link>
            </Button>
          )}

          {canHide &&
            !isDupProjection &&
            (confirmingHide ? (
              <div className="rounded-ds-md border border-status-danger-border bg-status-danger-soft/40 p-3 space-y-2">
                <p className="text-[13px] text-ds-text-1">
                  ¿Ocultar «{itemName}» del flujo?
                </p>
                <p className="text-[12px] text-ds-text-3">
                  {dteId
                    ? "La factura sigue en Facturación. Solo deja de contarse en el flujo."
                    : "La programación deja de proyectarse. No elimina el contrato."}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-10 flex-1 text-[13px]"
                    disabled={busy}
                    onClick={() => setConfirmingHide(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-10 flex-1 text-[13px]"
                    disabled={busy}
                    onClick={() => void doHide()}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Ocultar"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="h-11 w-full justify-start text-[13px] text-status-danger-fg hover:bg-status-danger-soft sm:h-10"
                onClick={() => setConfirmingHide(true)}
              >
                <EyeOff className="mr-2 h-4 w-4" /> Ocultar del flujo
              </Button>
            ))}

          {canMove && onMoveTo && (
            <div className="border-t border-ds-border-subtle pt-3">
              <p className="mb-2 px-1 text-[12px] font-medium text-ds-text-3">
                Mover a
              </p>
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex min-h-[38px] items-center rounded-ds-sm border border-ds-border-subtle px-3 font-mono text-[12px] text-ds-text-4 opacity-60"
                  aria-disabled="true"
                >
                  {weekLabel} · aquí
                </span>
                {openWeeks.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onMoveTo(w.key);
                    }}
                    className="inline-flex min-h-[38px] items-center rounded-ds-sm border border-ds-border-default px-3 font-mono text-[12px] text-ds-text-1 transition-colors hover:border-primary focus-visible:border-primary"
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ds-text-3">{label}</dt>
      <dd
        className={
          mono
            ? "text-right font-mono tabular-nums text-ds-text-1"
            : "text-right text-ds-text-1"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** PillVariant → CashflowCellStatus (aprox.) para que GestionGlyphs decida el
 *  caso PAID (sólo aprobada/OC) y el "pendiente" en PROJECTED. */
function variantToCellStatus(v: PillVariant): CashflowCellStatus {
  switch (v) {
    case "PAID":
      return "PAID";
    case "DRAFT":
      return "DRAFT";
    case "INVOICED":
    case "OVERDUE":
      return "INVOICED";
    case "FACTORING":
    case "FACTORING_COLLECTED":
      return "CEDED";
    case "VOIDED":
      return "VOIDED";
    default:
      return "PROJECTED";
  }
}

function docText(
  status: DraftProformaStatus,
  sentAt: string | null,
  recipient: string | null,
): string {
  switch (status) {
    case "SENT":
      return `Enviada${sentAt ? ` ${format(new Date(sentAt), "d MMM HH:mm", { locale: es })}` : ""}${recipient ? ` · ${recipient}` : ""}`;
    case "VIEWED":
      return "Vista por el cliente";
    case "APPROVED":
      return "Aprobada por el cliente";
    case "REJECTED":
      return "Corrección solicitada";
    default:
      return "Pendiente de enviar";
  }
}

/** Bloque informativo de gestión de cobro: proforma / estado de pago / OC.
 *  Filas no aplicables atenuadas (opacity-50). No renderiza si no hay nada. */
function GestionSection({
  gestion,
  emiteProforma,
  cellStatus,
}: {
  gestion: CellGestionSummary | null;
  emiteProforma: boolean;
  cellStatus: CashflowCellStatus;
}) {
  const hasProforma = !!gestion?.proformaRequired;
  const hasEp = !!gestion?.epRequired;
  const ocFolio = gestion?.ocFolio ?? null;
  const pendingProjection =
    !gestion && emiteProforma && cellStatus === "PROJECTED";
  if (!hasProforma && !hasEp && !ocFolio && !pendingProjection) return null;

  return (
    <div className="mt-5 space-y-2 border-t border-ds-border-subtle pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-ds-text-2">
          Gestión de cobro
        </h3>
        <GestionGlyphs
          gestion={gestion}
          emiteProforma={emiteProforma}
          cellStatus={cellStatus}
          size="sm"
        />
      </div>
      <GestionRow
        label="Proforma"
        applicable={hasProforma || pendingProjection}
        value={
          hasProforma
            ? docText(
                gestion!.proformaStatus,
                gestion!.proformaSentAt,
                gestion!.proformaLastRecipient,
              )
            : pendingProjection
              ? "Pendiente de emitir"
              : "No requerida"
        }
      />
      <GestionRow
        label="Estado de pago"
        applicable={hasEp}
        value={
          hasEp ? docText(gestion!.epStatus, gestion!.epSentAt, null) : "No requerido"
        }
      />
      <GestionRow
        label="OC del cliente"
        applicable={!!ocFolio}
        value={ocFolio ? `N° ${ocFolio}` : "Sin OC"}
      />
    </div>
  );
}

function GestionRow({
  label,
  applicable,
  value,
}: {
  label: string;
  applicable: boolean;
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 text-[13px]",
        !applicable && "opacity-50",
      )}
    >
      <span className="shrink-0 text-ds-text-3">{label}</span>
      <span className="text-right font-mono text-[12px] text-ds-text-4">
        {value}
      </span>
    </div>
  );
}
