"use client";

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { KPICard } from "@/components/opai-ds";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";

/**
 * Cabecera de salud: 3 KPIs que responden de un vistazo "¿cómo está la
 * caja?". Saldo hoy (info), Proyectado a fin de horizonte (ok/danger según
 * signo) y Próximo apretón (primer bucket cuyo saldo proyectado cruza a
 * negativo). Todo sale de la proyección ya construida — solo lectura.
 */
export function HealthHeader({ projection }: { projection: ProjectionMatrix }) {
  const opening = projection.openingBalanceClp;
  const projected = projection.cumulativeBalances.at(-1)?.balanceClp ?? opening;
  const firstGap =
    projection.cumulativePoints.find((p) => p.projectedClp < 0) ?? null;
  const gapLabel = firstGap
    ? projection.buckets.find((b) => b.key === firstGap.bucketKey)?.label ??
      firstGap.bucketKey
    : null;
  const unit = projection.range.granularity === "monthly" ? "meses" : "sem";

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <KPICard
        label="Saldo hoy"
        value={fmtCLP.format(opening)}
        hint="banco consolidado"
        icon={Wallet}
        iconVariant="info"
      />
      <KPICard
        label="Proyectado"
        value={fmtCLP.format(projected)}
        hint={`fin de horizonte · ${projection.buckets.length} ${unit}`}
        icon={projected >= 0 ? TrendingUp : TrendingDown}
        variant={projected >= 0 ? "ok" : "danger"}
        iconVariant={projected >= 0 ? "ok" : "danger"}
      />
      {firstGap ? (
        <KPICard
          label="Próximo apretón"
          value={fmtCLP.format(firstGap.projectedClp)}
          hint={gapLabel ?? undefined}
          icon={AlertTriangle}
          variant="danger"
          iconVariant="danger"
        />
      ) : (
        <KPICard
          label="Próximo apretón"
          value="Sin gaps"
          hint="proyección en positivo"
          icon={CheckCircle2}
          variant="ok"
          iconVariant="ok"
        />
      )}
    </div>
  );
}
