"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { OpeningBalanceDetail } from "@/modules/finance/flow-v3/matrix-types";
import { fmtClp, fmtShortDate } from "./format";

/** Días entre una cartola (YMD) y hoy (YMD). */
function daysSince(ymd: string | null, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Desglose del saldo bancario de hoy por cuenta (§5H). Número enmascarado. */
export function BankBalancePopover({
  open, onOpenChange, detail, todayYmd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: OpeningBalanceDetail;
  todayYmd: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Saldo del banco hoy</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {detail.perAccount.length === 0 ? (
            <li className="text-sm text-ds-text-4">No hay cuentas bancarias activas.</li>
          ) : (
            detail.perAccount.map((a, i) => {
              const d = daysSince(a.lastSnapshotYmd, todayYmd);
              const stale = d != null && d > 7;
              return (
                <li key={i} className="flex items-start justify-between gap-2 border-b border-ds-border-subtle pb-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ds-text-1">{a.bankName}</p>
                    <p className="font-mono text-[12px] uppercase tracking-tight text-ds-text-4">
                      {a.accountMasked}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums text-sm text-ds-text-1">{fmtClp(a.balanceClp)}</p>
                    <p
                      className={`text-[12px] ${stale ? "text-status-warn-fg" : "text-ds-text-4"}`}
                      title={
                        stale
                          ? `Última cartola hace ${d} días — el saldo puede estar desactualizado.`
                          : undefined
                      }
                    >
                      {a.lastSnapshotYmd ? `cartola ${fmtShortDate(a.lastSnapshotYmd)}` : "sin cartola"}
                    </p>
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-ds-border-default pt-2">
          <span className="text-sm font-medium text-ds-text-2">Total</span>
          <span className="tabular-nums text-sm font-semibold text-ds-text-1">
            {fmtClp(detail.totalClp)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
