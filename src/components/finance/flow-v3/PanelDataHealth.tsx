"use client";

import { Tag } from "@/components/opai-ds";
import { fmtClp, fmtShortDate } from "./format";
import type { PanelDataHealth as Health } from "@/modules/finance/flow-v3/insights-series";

export function PanelDataHealth({
  health,
  saldoHoy,
  onOpenBank,
}: {
  health: Health;
  saldoHoy: number | null;
  onOpenBank?: () => void;
}) {
  const chips: Array<{ key: string; variant: "warn" | "info" | "danger"; text: string }> = [];

  if (health.bankStale) {
    chips.push({
      key: "stale",
      variant: "warn",
      text: `Cartola ${health.bankStaleDays ?? "?"}d`,
    });
  }
  if (health.unroutedIncome.count > 0) {
    chips.push({
      key: "unrouted",
      variant: "warn",
      text: `Sin rutear ${health.unroutedIncome.count}`,
    });
  }
  if (health.balanceBreaks > 0) {
    chips.push({
      key: "breaks",
      variant: "danger",
      text: `Sellos ${health.balanceBreaks}`,
    });
  }
  if (health.assignPending > 0) {
    chips.push({
      key: "bandeja",
      variant: "info",
      text: `Bandeja ${health.assignPending}`,
    });
  }
  if (health.dteTruncated) {
    chips.push({
      key: "trunc",
      variant: "warn",
      text: "Cartera truncada (≥2000)",
    });
  }

  if (chips.length === 0 && !health.bankStale && health.accounts > 0) {
    return null;
  }

  // Sin cuentas: chip informativo aunque no haya otros avisos.
  const showEmptyBank = health.accounts === 0;
  if (chips.length === 0 && !showEmptyBank) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2">
      <p className="text-[12px] text-ds-text-3">
        {saldoHoy != null ? (
          <>
            Ancla {fmtClp(saldoHoy)}
            {health.bankAsOfYmd ? ` · ${fmtShortDate(health.bankAsOfYmd)}` : ""}
            {" · "}
            {health.accounts} cuenta{health.accounts === 1 ? "" : "s"}
            {" · "}
            {health.sealedWeeks} sellada{health.sealedWeeks === 1 ? "" : "s"}
          </>
        ) : (
          <>Sin cuentas bancarias configuradas</>
        )}
      </p>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <Tag key={c.key} size="sm" variant={c.variant}>
            {c.text}
          </Tag>
        ))}
      </div>
      {onOpenBank && saldoHoy != null && (
        <button
          type="button"
          className="ml-auto min-h-10 rounded-full px-3 text-[12px] font-medium text-primary hover:bg-primary/10 sm:min-h-9"
          onClick={onOpenBank}
        >
          Actualizar saldo
        </button>
      )}
    </div>
  );
}
