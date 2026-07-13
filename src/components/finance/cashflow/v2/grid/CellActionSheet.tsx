"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Pencil,
  EyeOff,
  FileText,
  Move,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CellStatusPill } from "@/components/finance/cashflow/CellStatusPill";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { hideFromFlowViaApi, type HideInput } from "./cashflow-hide";
import type { HideUndoPayload } from "./CellFlowActions";

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
}

/**
 * Sheet de acciones al tocar una celda con movimiento. Centraliza en un solo
 * lugar lo que antes estaba disperso (doble-clic para editar, ojo al hover para
 * ocultar): ver detalle, editar monto, ocultar del flujo y ver la factura. El
 * mover sigue siendo por arrastre (se indica como hint).
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
}: Props) {
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doHide() {
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

        <div className="mt-5 space-y-2 border-t border-ds-border-subtle pt-4">
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

          {canHide &&
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

          <div className="flex items-center gap-2 px-1 pt-1 text-[12px] text-ds-text-3">
            <Move className="h-3.5 w-3.5 shrink-0" />
            Para mover a otra semana, arrastrá el monto en la planilla.
          </div>
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
