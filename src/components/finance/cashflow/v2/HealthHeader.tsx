"use client";

import { Landmark, CalendarCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { currentBucketIndex } from "./projection-helpers";

type Tone = "info" | "ok" | "danger";

const TONE_BG: Record<Tone, string> = {
  info: "bg-status-info-soft text-status-info-fg",
  ok: "bg-status-ok-soft text-status-ok-fg",
  danger: "bg-status-danger-soft text-status-danger-fg",
};
const TONE_VALUE: Record<Tone, string> = {
  info: "text-ds-text-1",
  ok: "text-status-ok-fg",
  danger: "text-status-danger-fg",
};

interface KpiProps {
  label: string;
  value: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  tone: Tone;
}

function CompactKPI({ label, value, hint, Icon, tone }: KpiProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-ds-lg border border-ds-border-default bg-ds-surface-1 p-2.5 sm:p-3 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn("inline-flex items-center justify-center rounded-md p-1 shrink-0", TONE_BG[tone])}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-ds-text-3 truncate" title={label}>
          {label}
        </span>
      </div>
      <div
        className={cn(
          "font-mono font-semibold tabular-nums tracking-tight leading-none whitespace-nowrap overflow-hidden text-ellipsis",
          "text-[15px] sm:text-lg xl:text-2xl",
          TONE_VALUE[tone],
        )}
        title={value}
      >
        {value}
      </div>
      <div className="text-[10px] leading-snug text-ds-text-3 line-clamp-2 sm:line-clamp-none">
        {hint}
      </div>
    </div>
  );
}

/**
 * 3 KPIs compactos one-line para que entren en mobile sin romperse:
 *   - SALDO BANCO HOY: saldo consolidado real de hoy.
 *   - CIERRE DE LA SEMANA: saldo proyectado al cerrar la semana actual (fijo).
 *   - PRÓXIMO DÉFICIT: primer bucket en rojo, o "Sin déficits" si todo bien.
 */
export function HealthHeader({ projection }: { projection: ProjectionMatrix }) {
  const opening = projection.openingBalanceClp;
  const todayIdx = currentBucketIndex(projection.buckets);
  const todayBucket = todayIdx >= 0 ? projection.buckets[todayIdx] : null;
  const todayClosing =
    todayIdx >= 0 ? projection.cumulativePoints[todayIdx]?.projectedClp ?? opening : opening;
  const firstGap = projection.cumulativePoints.find((p) => p.projectedClp < 0) ?? null;
  const gapLabel = firstGap
    ? projection.buckets.find((b) => b.key === firstGap.bucketKey)?.label ?? firstGap.bucketKey
    : null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <CompactKPI
        label="Saldo banco hoy"
        value={fmtCLP.format(opening)}
        hint="real, todas tus cuentas"
        Icon={Landmark}
        tone="info"
      />
      <CompactKPI
        label="Cierre de la semana"
        value={fmtCLP.format(todayClosing)}
        hint={todayBucket ? `al cerrar ${todayBucket.label}` : "semana actual"}
        Icon={CalendarCheck}
        tone={todayClosing >= 0 ? "ok" : "danger"}
      />
      {firstGap ? (
        <CompactKPI
          label="Próximo déficit"
          value={fmtCLP.format(firstGap.projectedClp)}
          hint={gapLabel ? `primera en rojo · ${gapLabel}` : "primera semana en rojo"}
          Icon={AlertTriangle}
          tone="danger"
        />
      ) : (
        <CompactKPI
          label="Próximo déficit"
          value="Sin déficits"
          hint="proyección en positivo"
          Icon={CheckCircle2}
          tone="ok"
        />
      )}
    </div>
  );
}
