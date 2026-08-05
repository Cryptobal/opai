"use client";

import { useEffect, useMemo, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountPlanCombobox } from "../AccountPlanCombobox";
import {
  formatCLPInput,
  parseCLPInput,
} from "@/lib/finance/format-clp-input";
import { cn } from "@/lib/utils";
import type { LocalLink } from "./types";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export interface AllocationDetailPanelProps {
  open: boolean;
  onClose: () => void;
  links: LocalLink[];
  linksTotal: number;
  txAmountAbs: number;
  remaining: number;
  overflow: number;
  hasShortfall: boolean;
  allLinksAreReconcilable: boolean;
  isIncomeTx: boolean;
  diffMode: "prorate" | "single" | "manual";
  setDiffMode: (m: "prorate" | "single" | "manual") => void;
  diffAccountPlanId: string;
  setDiffAccountPlanId: (id: string) => void;
  diffLabel: string;
  setDiffLabel: (v: string) => void;
  restAccountId: string;
  setRestAccountId: (id: string) => void;
  restNote: string;
  setRestNote: (v: string) => void;
  eligibleShortfallAccounts: AccountPlanOption[];
  eligibleRemainderAccounts: AccountPlanOption[];
  updateLinkAmount: (key: string, amount: number) => void;
  removeLink: (key: string) => void;
}

export function AllocationDetailPanel({
  open,
  onClose,
  links,
  linksTotal,
  txAmountAbs,
  remaining,
  overflow,
  hasShortfall,
  allLinksAreReconcilable,
  isIncomeTx,
  diffMode,
  setDiffMode,
  diffAccountPlanId,
  setDiffAccountPlanId,
  diffLabel,
  setDiffLabel,
  restAccountId,
  setRestAccountId,
  restNote,
  setRestNote,
  eligibleShortfallAccounts,
  eligibleRemainderAccounts,
  updateLinkAmount,
  removeLink,
}: AllocationDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const needsShortfallAccount =
    hasShortfall &&
    allLinksAreReconcilable &&
    diffMode !== "manual" &&
    !diffAccountPlanId;
  const needsRemainderAccount = remaining > 0.01 && !restAccountId;
  const canAccept = useMemo(
    () => !needsShortfallAccount && !needsRemainderAccount,
    [needsShortfallAccount, needsRemainderAccount],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = panelRef.current;
    el?.querySelector<HTMLElement>("button, input, [tabindex]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleAccept = () => {
    if (needsShortfallAccount) {
      toast.error("Seleccioná una cuenta contable para la diferencia");
      return;
    }
    if (needsRemainderAccount) {
      toast.error("Seleccioná una cuenta contable para el resto");
      return;
    }
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de asignación"
      ref={panelRef}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-ds-border-default px-4 sm:px-6 py-3">
        <div>
          <p className="text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
            Detalle
          </p>
          <p className="text-[15px] font-medium text-ds-text-1">
            Asignación y diferencia
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 w-11 p-0"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4",
          "motion-reduce:transition-none",
        )}
      >
        {links.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">
            Todavía no hay vínculos. Seleccioná facturas o cesiones.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li
                key={l.key}
                className="flex items-center gap-2 rounded-lg border border-ds-border-default p-2.5"
              >
                <span className="flex-1 min-w-0 truncate text-[13px] text-ds-text-1">
                  {l.label}
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="h-11 sm:h-9 w-32 font-mono text-right"
                  value={formatCLPInput(String(l.amount))}
                  onChange={(e) =>
                    updateLinkAmount(
                      l.key,
                      parseCLPInput(e.target.value) ?? 0,
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 sm:h-9 sm:w-9 p-0 shrink-0"
                  onClick={() => removeLink(l.key)}
                  aria-label="Quitar vínculo"
                >
                  <Trash2 className="h-3.5 w-3.5 text-status-danger-fg" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-ds-border-default p-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ds-text-3">Asignado</span>
            <span className="font-mono font-medium">
              {fmtCLP.format(linksTotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ds-text-3">Monto del lote</span>
            <span className="font-mono">{fmtCLP.format(txAmountAbs)}</span>
          </div>
          <div
            className={cn(
              "flex justify-between font-medium",
              remaining > 0.01 || hasShortfall
                ? "text-status-warn-fg"
                : "text-status-ok-fg",
            )}
          >
            <span>
              {hasShortfall
                ? "Diferencia (banco < facturas)"
                : remaining > 0.01
                  ? "Falta asignar"
                  : "Cuadrado"}
            </span>
            <span className="font-mono">
              {hasShortfall
                ? `−${fmtCLP.format(overflow)}`
                : remaining > 0.01
                  ? fmtCLP.format(remaining)
                  : "✓"}
            </span>
          </div>
        </div>

        {hasShortfall && allLinksAreReconcilable && (
          <div className="rounded-lg border border-status-warn-border bg-status-warn-soft/10 p-3 space-y-3">
            <p className="text-[13px] font-medium text-ds-text-1">
              ¿Cómo manejar la diferencia de{" "}
              <span className="font-mono tabular-nums">
                {fmtCLP.format(overflow)}
              </span>
              ?
            </p>
            <div className="space-y-1.5">
              {(
                [
                  {
                    id: "prorate" as const,
                    title: "Prorratear por centro de costo",
                    desc: "Reparte la diferencia entre centros de costo de cada factura.",
                  },
                  {
                    id: "single" as const,
                    title: "Todo a una sola cuenta",
                    desc: `Imputa ${fmtCLP.format(overflow)} a la cuenta elegida.`,
                  },
                  {
                    id: "manual" as const,
                    title: "Manual (asignar después)",
                    desc: "No asignar costo ahora. Las facturas quedan PARTIAL.",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-start gap-2 text-[13px] cursor-pointer p-2 rounded-md hover:bg-ds-surface-2 min-h-11"
                >
                  <input
                    type="radio"
                    name="reconcile-diff-mode"
                    checked={diffMode === opt.id}
                    onChange={() => setDiffMode(opt.id)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="font-medium text-ds-text-1">
                      {opt.title}
                    </span>
                    <span className="block text-ds-text-3 mt-0.5 text-[12px]">
                      {opt.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {diffMode !== "manual" && (
              <div className="space-y-2 pt-1">
                <AccountPlanCombobox
                  items={eligibleShortfallAccounts}
                  value={diffAccountPlanId}
                  onChange={setDiffAccountPlanId}
                  placeholder={
                    isIncomeTx
                      ? "Buscar cuenta de gasto / costo factoring…"
                      : "Buscar cuenta de ingreso / descuento…"
                  }
                  emptyLabel="Seleccionar cuenta"
                  triggerClassName="w-full"
                />
                <Input
                  value={diffLabel}
                  onChange={(e) => setDiffLabel(e.target.value)}
                  placeholder={
                    isIncomeTx
                      ? "Nota del asiento (ej. 'Comisión factoring')"
                      : "Nota del asiento (ej. 'Descuento proveedor')"
                  }
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
            )}
          </div>
        )}

        {hasShortfall && !allLinksAreReconcilable && (
          <p className="text-[13px] text-status-danger-fg">
            Para imputar la diferencia hay ítems manuales en el lote. Quitálos
            o procesá la categorización manual aparte.
          </p>
        )}

        {remaining > 0.01 && (
          <div className="rounded-lg border border-status-info-border bg-status-info-soft/10 p-3 space-y-3">
            <p className="text-[13px] font-medium text-ds-text-1">
              {isIncomeTx ? "Sobra " : "Falta cubrir "}
              <span className="font-mono tabular-nums">
                {fmtCLP.format(remaining)}
              </span>
              {isIncomeTx ? " del depósito" : " del egreso"}
            </p>
            <AccountPlanCombobox
              items={eligibleRemainderAccounts}
              value={restAccountId}
              onChange={setRestAccountId}
              placeholder={
                isIncomeTx
                  ? "Buscar cuenta de ingreso…"
                  : "Buscar cuenta de gasto…"
              }
              emptyLabel="Seleccionar cuenta"
              triggerClassName="w-full"
            />
            <Input
              placeholder={
                isIncomeTx
                  ? "Nota del asiento (ej. 'Anticipo cliente')"
                  : "Nota del asiento (ej. 'Cargo bancario')"
              }
              value={restNote}
              onChange={(e) => setRestNote(e.target.value)}
              maxLength={300}
              className="h-11 sm:h-9 text-base sm:text-sm"
            />
          </div>
        )}
      </div>

      <div
        className={cn(
          "shrink-0 flex items-center gap-2 border-t border-ds-border-default",
          "bg-background px-4 sm:px-6",
          "h-[72px]",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-10 shrink-0"
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-11 sm:h-10 flex-1 min-w-0"
          onClick={handleAccept}
          disabled={!canAccept}
        >
          Aceptar
        </Button>
      </div>
    </div>
  );
}
