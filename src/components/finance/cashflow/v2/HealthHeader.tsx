"use client";

import {
  Landmark,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { KPICard } from "@/components/opai-ds";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { currentBucketIndex } from "./projection-helpers";

/**
 * Cabecera de salud: 3 KPIs que responden de un vistazo "¿cómo está la caja?".
 *
 * 1. SALDO BANCO HOY — saldo consolidado real de todas las cuentas al día.
 * 2. CIERRE DE LA SEMANA — saldo proyectado al cerrar la semana actual de
 *    hoy (siempre fijo a la semana actual; no cambia con la navegación).
 * 3. PRÓXIMO DÉFICIT — primer bucket cuyo saldo cruza a negativo, o "Sin
 *    déficits a la vista" si todo bien.
 *
 * Sale ruidoso del "fin de horizonte 55 sem" — eliminado por inútil.
 */
export function HealthHeader({ projection }: { projection: ProjectionMatrix }) {
  const opening = projection.openingBalanceClp;

  // Cierre proyectado de la semana ACTUAL de hoy (no la seleccionada en el strip)
  const todayIdx = currentBucketIndex(projection.buckets);
  const todayBucket = todayIdx >= 0 ? projection.buckets[todayIdx] : null;
  const todayClosing =
    todayIdx >= 0
      ? (projection.cumulativePoints[todayIdx]?.projectedClp ?? opening)
      : opening;

  // Primer bucket en déficit
  const firstGap = projection.cumulativePoints.find((p) => p.projectedClp < 0) ?? null;
  const gapLabel = firstGap
    ? (projection.buckets.find((b) => b.key === firstGap.bucketKey)?.label ??
       firstGap.bucketKey)
    : null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <KPICard
        label="Saldo banco hoy"
        value={fmtCLP.format(opening)}
        hint="real, todas tus cuentas"
        icon={Landmark}
        iconVariant="info"
      />
      <KPICard
        label="Cierre de la semana"
        value={fmtCLP.format(todayClosing)}
        hint={todayBucket ? `según flujo, al cerrar ${todayBucket.label}` : "semana actual"}
        icon={CalendarCheck}
        variant={todayClosing >= 0 ? "ok" : "danger"}
        iconVariant={todayClosing >= 0 ? "ok" : "danger"}
      />
      {firstGap ? (
        <KPICard
          label="Próximo déficit"
          value={fmtCLP.format(firstGap.projectedClp)}
          hint={gapLabel ? `primera semana en rojo · ${gapLabel}` : "primera semana en rojo"}
          icon={AlertTriangle}
          variant="danger"
          iconVariant="danger"
        />
      ) : (
        <KPICard
          label="Próximo déficit"
          value="Sin déficits"
          hint="proyección en positivo"
          icon={CheckCircle2}
          variant="ok"
          iconVariant="ok"
        />
      )}
    </div>
  );
}
