"use client";

/**
 * @deprecated Header de propuesta v1. Reemplazado por
 * `@/components/cpq/workspace/consolidado/BundleStickyBar` (KPIs consolidados
 * sticky bajo el topbar).
 */

import { Tag } from "@/components/opai-ds";
import type { BundleDetail } from "./useBundle";

function fmtMoney(n: number, currency: string) {
  if (currency === "UF") {
    return `${n.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`;
  }
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

export function BundleHeader({
  bundle,
  saving,
}: {
  bundle: BundleDetail;
  saving?: boolean;
}) {
  const t = bundle.totals;
  const margin =
    t.weightedMarginPct != null
      ? `${t.weightedMarginPct.toFixed(1)}%`
      : "—";

  return (
    <header className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-mono text-ds-text-3">{bundle.code}</p>
          <h1 className="font-display text-xl sm:text-2xl text-foreground truncate">
            {bundle.name || bundle.deal?.title || "Propuesta multi-instalación"}
          </h1>
          <p className="text-[13px] text-ds-text-3 mt-0.5">
            {[bundle.account?.name, bundle.deal?.title].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="text-[12px] text-status-ok-fg">Guardado ✓</span>
          ) : null}
          <Tag variant={bundle.status === "sent" ? "ok" : "neutral"} size="sm">
            {STATUS_LABEL[bundle.status] || bundle.status}
          </Tag>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Total mensual", value: fmtMoney(t.totalMonthly, t.currency) },
          { label: "Margen pond.", value: margin },
          { label: "Dotación", value: String(t.totalGuards) },
          {
            label: "Instalaciones",
            value: `${t.includedCount}/${t.installationCount}`,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
          >
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">
              {kpi.label}
            </p>
            <p className="font-mono text-[15px] text-primary mt-0.5">{kpi.value}</p>
          </div>
        ))}
      </div>
    </header>
  );
}
