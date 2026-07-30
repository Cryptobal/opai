"use client";

/**
 * Resumen consolidado de la propuesta: total mensual cliente, barra apilada
 * por instalación y pagos únicos (líneas `unico`, fuera del mensual).
 */

import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { computeBundleBilling, fmtBundleMoney } from "./bundle-billing";

const STACK_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

export function ResumenSection({
  bundle,
  ufValue,
}: {
  bundle: BundleDetail;
  ufValue: number | null;
}) {
  const billing = computeBundleBilling(bundle);
  const included = billing.byQuote.filter((q) => q.includedInProposal);
  const t = bundle.totals;

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-resumen">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-ds-text-3">
            Total mensual cliente
          </p>
          <p className="font-mono text-2xl font-bold text-status-ok-fg">
            {fmtBundleMoney(billing.monthlyClp, bundle.currency, ufValue)}
          </p>
          {bundle.currency === "UF" && (
            <p className="text-[12px] tabular-nums text-ds-text-3">
              ${Math.round(billing.monthlyClp).toLocaleString("es-CL")} · UF del día
            </p>
          )}
        </div>
        <div className="flex gap-4 text-[13px] text-ds-text-2">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">Margen pond.</p>
            <p className="font-mono font-semibold">
              {t.weightedMarginPct != null ? `${t.weightedMarginPct.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">Dotación</p>
            <p className="font-mono font-semibold">{t.totalGuards}</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">Instalaciones</p>
            <p className="font-mono font-semibold">{t.includedCount}/{t.installationCount}</p>
          </div>
        </div>
      </div>

      {/* Barra apilada por instalación */}
      {included.length > 0 && billing.monthlyClp > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-ds-surface-2">
            {included.map((q, i) => (
              <div
                key={q.quoteId}
                className={cn("h-full", STACK_COLORS[i % STACK_COLORS.length])}
                style={{ width: `${(q.monthlyClp / billing.monthlyClp) * 100}%` }}
                title={`${q.installationName || q.code}: ${fmtBundleMoney(q.monthlyClp, bundle.currency, ufValue)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {included.map((q, i) => (
              <span key={q.quoteId} className="inline-flex items-center gap-1.5 text-[12px] text-ds-text-3">
                <span className={cn("h-2 w-2 rounded-full", STACK_COLORS[i % STACK_COLORS.length])} />
                <span className="truncate max-w-[10rem]">{q.installationName || q.code}</span>
                <span className="font-mono tabular-nums text-ds-text-2">
                  {fmtBundleMoney(q.monthlyClp, bundle.currency, ufValue)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pagos únicos (fuera del mensual) */}
      {billing.oneTimeClp > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-warn-border bg-status-warn-soft/40 px-3 py-2">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-status-warn-fg">
              Pago inicial único
            </p>
            <p className="text-[12px] text-ds-text-3">Se cobra una sola vez, fuera del total mensual.</p>
          </div>
          <p className="font-mono text-[15px] font-bold text-status-warn-fg">
            {fmtBundleMoney(billing.oneTimeClp, bundle.currency, ufValue)}
          </p>
        </div>
      )}
    </Surface>
  );
}
