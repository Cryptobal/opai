"use client";
import { TrendingUp } from "lucide-react";
import {
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FinanceCashflowItemSource } from "@/modules/finance/cashflow/types";
import { fmt } from "./MatrixHelpers";

const SOURCE_BADGE: Record<FinanceCashflowItemSource, string | null> = {
  MANUAL: null,
  CONTRACT: "Contrato",
  PAYROLL: "Sueldos",
  PAYROLL_LIQUIDO: "Líquido",
  PAYROLL_PREVIRED: "PreviRed",
  RECURRING_DTE: "DTE recurrente",
  SUPPLIER: "Proveedor",
  IVA: "F29",
  TURNOS_EXTRA: "TE",
  QUINCENA: "Quincena",
  RETIRO_SOCIO: "Retiro socio",
  AJUSTE: "Ajuste",
  OTHER: null,
};

interface HeaderProps {
  display: string;
  categoryName: string;
  crmAccountName: string | null;
  source: FinanceCashflowItemSource;
  currency: string;
  hasIpcAdjustment: boolean;
  ipcAdjustmentMonths: number | null;
}

export function CashflowItemDrawerHeader({
  display,
  categoryName,
  crmAccountName,
  source,
  currency,
  hasIpcAdjustment,
  ipcAdjustmentMonths,
}: HeaderProps) {
  const badge = SOURCE_BADGE[source];
  return (
    <SheetHeader className="px-4 pt-5 pb-3 border-b border-border space-y-1.5 text-left">
      {crmAccountName && (
        <p className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3 truncate">
          {crmAccountName}
        </p>
      )}
      <SheetTitle className="text-[16px] font-semibold text-ds-text-1 truncate">
        {display}
      </SheetTitle>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ds-text-3">{categoryName}</span>
        {badge && (
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-4">
            {badge}
          </span>
        )}
        {currency === "UF" && (
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg">
            UF
          </span>
        )}
        {hasIpcAdjustment && currency !== "UF" && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-status-warn-soft text-status-warn-fg">
            <TrendingUp className="h-2.5 w-2.5" />
            IPC{ipcAdjustmentMonths ? ` · ${ipcAdjustmentMonths}m` : ""}
          </span>
        )}
        {/* TODO PR3: render badge de estado de DTE vinculado */}
      </div>
    </SheetHeader>
  );
}

interface AmountProps {
  amountClp: number;
  actualAmountClp: number | null;
  kind: "INCOME" | "EXPENSE";
}

export function CashflowItemDrawerAmount({
  amountClp,
  actualAmountClp,
  kind,
}: AmountProps) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-mono uppercase tracking-wider text-ds-text-3">
        Monto del período
      </p>
      <p
        className={`text-[24px] font-semibold tabular-nums ${
          kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg"
        }`}
      >
        ${fmt.format(amountClp)}
      </p>
      {actualAmountClp !== null && actualAmountClp > 0 && (
        <p className="text-[12px] text-ds-text-3">
          Real ejecutado:{" "}
          <span className="font-mono tabular-nums text-ds-text-2">
            ${fmt.format(actualAmountClp)}
          </span>
        </p>
      )}
    </div>
  );
}

interface BaseProps {
  baseAmount: number;
  currency: string;
  recurrenceLabel: string | null;
  recurrenceLoading: boolean;
  sourceRefCode: string | null;
}

export function CashflowItemDrawerBase({
  baseAmount,
  currency,
  recurrenceLabel,
  recurrenceLoading,
  sourceRefCode,
}: BaseProps) {
  return (
    <div className="space-y-1.5 rounded-ds-md bg-muted/20 p-3">
      {baseAmount > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ds-text-3">Monto base</span>
          <span className="text-[13px] font-mono font-semibold tabular-nums text-ds-text-1">
            {currency === "UF"
              ? `UF ${new Intl.NumberFormat("es-CL", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(baseAmount)}`
              : `$${fmt.format(baseAmount)}`}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-ds-text-3">Recurrencia</span>
        <span className="text-[13px] text-ds-text-1">
          {recurrenceLoading ? "…" : (recurrenceLabel ?? "—")}
        </span>
      </div>
      {sourceRefCode && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ds-text-3">Ref</span>
          <span className="text-[12px] font-mono text-ds-text-2 truncate">
            {sourceRefCode}
          </span>
        </div>
      )}
    </div>
  );
}
