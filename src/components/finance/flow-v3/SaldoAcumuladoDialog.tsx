"use client";

import { Landmark, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/opai-ds";
import type { WeekPendingBreakdown } from "@/modules/finance/flow-v3/balance-breakdown";
import { weekLabel } from "@/modules/finance/flow-v3/weeks";
import { fmtClp } from "./format";

export type SaldoDialogPayload =
  | {
      kind: "current";
      weekKey: string;
      balance: number;
      bankToday: number;
      breakdown: WeekPendingBreakdown;
    }
  | {
      kind: "seal-break";
      weekKey: string;
      balance: number;
      vsWeek: string;
      delta: number;
    };

/**
 * Detalle del saldo acumulado (semana actual) o inconsistencia entre sellos.
 * Reemplaza el tooltip nativo con ⚠ «descuadre vs cierre».
 */
export function SaldoAcumuladoDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SaldoDialogPayload | null;
}) {
  if (!payload) return null;

  const week = weekLabel(payload.weekKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none max-lg:overflow-y-auto">
        {payload.kind === "current" ? (
          <CurrentBody week={week} payload={payload} onClose={() => onOpenChange(false)} />
        ) : (
          <SealBreakBody week={week} payload={payload} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CurrentBody({
  week,
  payload,
  onClose,
}: {
  week: string;
  payload: Extract<SaldoDialogPayload, { kind: "current" }>;
  onClose: () => void;
}) {
  const { bankToday, breakdown, balance } = payload;
  return (
    <>
      <DialogHeader className="space-y-1 border-b border-ds-border-subtle px-5 py-4 text-left">
        <DialogTitle className="flex items-center gap-2 text-base text-ds-text-1">
          <Landmark className="h-4 w-4 text-ds-text-3" aria-hidden />
          Saldo acumulado · {week}
        </DialogTitle>
        <DialogDescription className="text-[13px] text-ds-text-3">
          Manda el banco de hoy. Los pendientes aún no están en la cartola.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Tag size="sm" variant="info">
            Semana actual
          </Tag>
          <Tag size="sm" variant="neutral">
            En vivo
          </Tag>
        </div>

        <dl className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3 text-[13px]">
          <Row label="Banco hoy" value={fmtClp(bankToday)} />
          <Row
            label="Ingresos pendientes"
            value={`+${fmtClp(breakdown.pendingIncome)}`}
            tone="ok"
          />
          <Row
            label="Egresos pendientes"
            value={`−${fmtClp(breakdown.pendingExpense)}`}
            tone="danger"
          />
          <div className="border-t border-ds-border-default pt-2">
            <Row label="Saldo acumulado" value={fmtClp(balance)} strong />
          </div>
        </dl>

        <p className="text-[12px] leading-snug text-ds-text-3">
          Conciliar (verde/morado) fija el movimiento en banco. Cerrar la semana
          solo congela el plan restante; no hace falta cuadrar contra un sello
          anterior.
        </p>
      </div>

      <DialogFooter className="border-t border-ds-border-subtle px-5 py-3 sm:justify-end">
        <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={onClose}>
          Entendido
        </Button>
      </DialogFooter>
    </>
  );
}

function SealBreakBody({
  week,
  payload,
  onClose,
}: {
  week: string;
  payload: Extract<SaldoDialogPayload, { kind: "seal-break" }>;
  onClose: () => void;
}) {
  const vs = weekLabel(payload.vsWeek);
  return (
    <>
      <DialogHeader className="space-y-1 border-b border-ds-border-subtle px-5 py-4 text-left">
        <DialogTitle className="flex items-center gap-2 text-base text-ds-text-1">
          <Lock className="h-4 w-4 text-status-warn-fg" aria-hidden />
          Sellos inconsistentes · {week}
        </DialogTitle>
        <DialogDescription className="text-[13px] text-ds-text-3">
          Dos semanas cerradas no encadenan con el flujo real entre ellas.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Tag size="sm" variant="warn">
            Sello vs sello
          </Tag>
          <Tag size="sm" variant="neutral">
            vs {vs}
          </Tag>
        </div>

        <dl className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3 text-[13px]">
          <Row label="Saldo sellado" value={fmtClp(payload.balance)} strong />
          <Row
            label={`Diferencia con cadena desde ${vs}`}
            value={fmtClp(payload.delta)}
            tone={payload.delta < 0 ? "danger" : "warn"}
          />
        </dl>

        <p className="text-[12px] leading-snug text-ds-text-3">
          Reabre uno de los cierres si necesitas corregir el sello. El saldo de
          la semana actual sigue al banco de hoy, no a esta diferencia.
        </p>
      </div>

      <DialogFooter className="border-t border-ds-border-subtle px-5 py-3 sm:justify-end">
        <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={onClose}>
          Entendido
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
  strong?: boolean;
}) {
  const color =
    tone === "ok"
      ? "text-status-ok-fg"
      : tone === "warn"
        ? "text-status-warn-fg"
        : tone === "danger"
          ? "text-status-danger-fg"
          : strong
            ? "text-ds-text-1"
            : "text-ds-text-2";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ds-text-4">{label}</dt>
      <dd className={`tabular-nums ${color} ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
