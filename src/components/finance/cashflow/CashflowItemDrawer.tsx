"use client";
import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, AlertCircle, CheckCircle2, Send } from "lucide-react";
import type {
  ProjectionBucket,
  FinanceCashflowItemSource,
  CashflowCellStatus,
} from "@/modules/finance/cashflow/types";
import { StatusBadge } from "./MatrixHelpers";
import { humanReadableRecurrence } from "./recurrence-label";
import { fmt } from "./MatrixHelpers";
import {
  CashflowItemDrawerActions,
  type DrawerMode,
} from "./CashflowItemDrawerActions";
import {
  CashflowItemDrawerHeader,
  CashflowItemDrawerAmount,
  CashflowItemDrawerBase,
} from "./CashflowItemDrawerHeader";
import { useCashflowItemActions } from "./use-cashflow-item-actions";
import { CobranzaSendDialog } from "./CobranzaSendDialog";

export interface DrawerItemTarget {
  itemId: string;
  itemName: string;
  installationId: string | null;
  installationName: string | null;
  crmAccountId: string | null;
  crmAccountName: string | null;
  baseAmount: number;
  currency: string;
  hasIpcAdjustment: boolean;
  ipcAdjustmentMonths: number | null;
  source: FinanceCashflowItemSource;
  sourceRefCode: string | null;
  bucketKey: string;
  amountClp: number;
  actualAmountClp: number | null;
  scheduledDate: string;
  /** Null si la cuota es virtual; el server materializa antes de actuar. */
  occurrenceId: string | null;
  categoryName: string;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  /** Estado de la celda respecto al DTE vinculado. PROJECTED si no hay vínculo. */
  cellStatus?: CashflowCellStatus;
  /** dteId vinculado (si existe) para deep-link al DTE. */
  dteId?: string | null;
  /** Folio del DTE vinculado, si existe. Mostrado inline con "Estado factura"
   *  en mobile, ya que el tooltip de la celda no se ve en touch. */
  dteFolio?: number | null;
  /** Días de mora (solo INVOICED). */
  daysOverdue?: number;
}

interface RecurrenceInfo {
  recurrence: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
}

interface Props {
  target: DrawerItemTarget | null;
  granularity: "weekly" | "monthly";
  buckets: ProjectionBucket[];
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onActionDone: () => void;
}

export function CashflowItemDrawer({
  target,
  granularity,
  buckets,
  canManage,
  onOpenChange,
  onActionDone,
}: Props) {
  const open = target !== null;
  const [recurrence, setRecurrence] = useState<RecurrenceInfo | null>(null);
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);
  const [mode, setMode] = useState<DrawerMode>("idle");
  const [success, setSuccess] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [cobranzaOpen, setCobranzaOpen] = useState(false);

  function handleSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => {
      onActionDone();
    }, 700);
  }

  const actions = useCashflowItemActions(target, handleSuccess);

  useEffect(() => {
    if (!open) {
      setRecurrence(null);
      setSuccess(null);
      setMode("idle");
      setDraftAmount("");
      actions.reset();
    }
    // actions identity changes per render; we only want reset on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!target || target.itemId === "_orphan") {
      setRecurrence(null);
      return;
    }
    setRecurrenceLoading(true);
    fetch(`/api/finance/cashflow/items/${target.itemId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data) {
          setRecurrence({
            recurrence: j.data.recurrence,
            dayOfMonth: j.data.dayOfMonth,
            dayOfWeek: j.data.dayOfWeek,
            monthOfYear: j.data.monthOfYear,
          });
        }
      })
      .catch(() => {
        // Recurrencia es info secundaria — si falla, no rompemos el drawer.
      })
      .finally(() => setRecurrenceLoading(false));
  }, [target]);

  const otherBuckets = useMemo(
    () => (target ? buckets.filter((b) => b.key !== target.bucketKey) : []),
    [buckets, target],
  );

  if (!target) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" />
      </Sheet>
    );
  }

  function onSaveAmount() {
    const cleaned = draftAmount.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      // El hook expone error vía su propio state; reutilizamos su pipeline
      // re-llamando con valor inválido — más limpio: validamos arriba y
      // sólo llamamos cuando es válido.
      return;
    }
    actions.saveAmount(n, fmt.format(n));
  }

  const recurrenceLabel = recurrence
    ? humanReadableRecurrence(recurrence)
    : null;
  const display = target.installationName ?? target.itemName;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90vh] overflow-y-auto p-0"
      >
        <CashflowItemDrawerHeader
          display={display}
          categoryName={target.categoryName}
          crmAccountName={target.crmAccountName}
          source={target.source}
          currency={target.currency}
          hasIpcAdjustment={target.hasIpcAdjustment}
          ipcAdjustmentMonths={target.ipcAdjustmentMonths}
        />

        <div className="px-4 py-4 space-y-4">
          {success && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-ds-md bg-status-ok-soft border border-status-ok-fg/20">
              <CheckCircle2 className="h-4 w-4 text-status-ok-fg shrink-0" />
              <p className="text-[13px] text-status-ok-fg font-medium">{success}</p>
            </div>
          )}
          {actions.error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-ds-md bg-status-warn-soft border border-status-warn-fg/20">
              <AlertCircle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
              <p className="text-[13px] text-status-warn-fg">{actions.error}</p>
            </div>
          )}

          <CashflowItemDrawerAmount
            amountClp={target.amountClp}
            actualAmountClp={target.actualAmountClp}
            kind={target.kind}
          />

          {target.cellStatus && target.cellStatus !== "PROJECTED" && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-ds-md bg-muted/20">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3">
                  Estado factura
                  {target.dteFolio ? (
                    <span className="ml-1 normal-case tracking-normal text-ds-text-2">
                      · N° {target.dteFolio}
                    </span>
                  ) : null}
                </span>
                {target.cellStatus === "INVOICED" &&
                  target.daysOverdue !== undefined &&
                  target.daysOverdue > 0 && (
                    <span className="text-[11px] text-status-warn-fg">
                      {target.daysOverdue} día{target.daysOverdue !== 1 ? "s" : ""} de mora
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={target.cellStatus}
                  daysOverdue={target.daysOverdue}
                  size="md"
                />
                {target.dteId && (
                  <a
                    href={`/finanzas/facturacion/dtes?openDteId=${target.dteId}`}
                    className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                  >
                    Ver DTE
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          <CashflowItemDrawerBase
            baseAmount={target.baseAmount}
            currency={target.currency}
            recurrenceLabel={recurrenceLabel}
            recurrenceLoading={recurrenceLoading}
            sourceRefCode={target.sourceRefCode}
          />

          {(target.crmAccountId || target.installationId) && (
            <div className="space-y-2">
              {target.crmAccountId && (
                <a
                  href={`/crm/accounts/${target.crmAccountId}?tab=contracts`}
                  className="flex items-center justify-between gap-2 px-3 py-3 min-h-[48px] rounded-ds-md border border-border hover:bg-muted/20 text-[13px] text-ds-text-1"
                >
                  <span>Ver cuenta CRM</span>
                  <ExternalLink className="h-4 w-4 text-ds-text-3" />
                </a>
              )}
              {target.installationId && (
                <a
                  href={`/crm/installations/${target.installationId}`}
                  className="flex items-center justify-between gap-2 px-3 py-3 min-h-[48px] rounded-ds-md border border-border hover:bg-muted/20 text-[13px] text-ds-text-1"
                >
                  <span>Ver instalación</span>
                  <ExternalLink className="h-4 w-4 text-ds-text-3" />
                </a>
              )}
            </div>
          )}

          {canManage && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3">
                Acciones
              </p>
              {target.cellStatus === "INVOICED" && target.dteId && (
                <Button
                  variant="outline"
                  onClick={() => setCobranzaOpen(true)}
                  className="w-full h-11 sm:h-10 text-[13px] justify-start text-status-info-fg hover:bg-status-info-soft"
                >
                  <Send className="h-4 w-4 mr-2" /> Enviar cobranza…
                </Button>
              )}
              <CashflowItemDrawerActions
                mode={mode}
                busy={actions.busy}
                granularity={granularity}
                otherBuckets={otherBuckets}
                draftAmount={draftAmount}
                currentAmount={target.amountClp}
                onDraftAmountChange={setDraftAmount}
                onStartMove={() => setMode("moving")}
                onStartEdit={() => {
                  setDraftAmount(fmt.format(target.amountClp));
                  setMode("editingAmount");
                }}
                onStartCancel={() => setMode("confirmingCancel")}
                onStartEnd={() => setMode("confirmingEnd")}
                onCancelMode={() => setMode("idle")}
                onMoveTo={actions.moveToBucket}
                onSaveAmount={onSaveAmount}
                onConfirmCancel={actions.cancelOccurrence}
                onConfirmEnd={actions.endRecurrence}
              />
            </div>
          )}
        </div>
      </SheetContent>
      {target.dteId && (
        <CobranzaSendDialog
          open={cobranzaOpen}
          onClose={() => setCobranzaOpen(false)}
          dteId={target.dteId}
          crmAccountId={target.crmAccountId}
          daysOverdue={target.daysOverdue ?? 0}
        />
      )}
    </Sheet>
  );
}
