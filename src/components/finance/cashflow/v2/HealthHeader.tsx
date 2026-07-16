"use client";

import {
  Landmark,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import type { ComponentType } from "react";
import { getISOWeek } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { currentBucketIndex } from "./projection-helpers";

type Tone = "info" | "ok" | "warn" | "danger";

const TONE_BG: Record<Tone, string> = {
  info: "bg-status-info-soft text-status-info-fg",
  ok: "bg-status-ok-soft text-status-ok-fg",
  warn: "bg-status-warn-soft text-status-warn-fg",
  danger: "bg-status-danger-soft text-status-danger-fg",
};
const TONE_VALUE: Record<Tone, string> = {
  info: "text-ds-text-1",
  ok: "text-status-ok-fg",
  warn: "text-status-warn-fg",
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

/** Etiqueta "Sem NN" de un bucket a partir de su fecha de cierre (mismo criterio
 *  que el panel de semanas por cerrar). */
function weekLabel(end: Date): string {
  return `Sem ${getISOWeek(new Date(end))}`;
}

/**
 * Chip de frescura del ancla: una proyección anclada hace varias semanas
 * arrastra error (la caja futura parte de un saldo viejo). Se muestra junto al
 * saldo para que el usuario sepa de dónde arranca la proyección.
 */
function AnchorChip({ anchor }: { anchor: ProjectionAnchorInfo | null }) {
  let tone: Tone = "ok";
  let Icon = Lock;
  let text: string;
  if (!anchor) {
    tone = "warn";
    Icon = AlertTriangle;
    text = "Sin ancla · proyecta desde el saldo de hoy";
  } else {
    const weeksAgo = Math.floor(
      (Date.now() - new Date(anchor.weekEndDate).getTime()) / (7 * 86_400_000),
    );
    const sem = weekLabel(new Date(anchor.weekEndDate));
    if (weeksAgo > 2) {
      tone = "warn";
      Icon = AlertTriangle;
      text = `Ancla de hace ${weeksAgo} semanas · ${sem}`;
    } else {
      text = `Anclado en ${sem}`;
    }
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-ds-md px-2 py-1 text-[12px] font-medium",
        TONE_BG[tone],
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
}

/**
 * 3 KPIs compactos one-line para que entren en mobile sin romperse:
 *   - SALDO BANCO HOY: saldo consolidado real de hoy (+ chip de frescura del ancla).
 *   - CIERRE DE LA SEMANA: saldo proyectado al cerrar la semana actual (fijo).
 *   - QUIEBRE DE CAJA: la semana en que la caja se pone en rojo (+ horizonte y
 *     monto faltante), o "Sin quiebre" si la proyección se mantiene positiva.
 *
 * `projection` = matriz activa del caché client (no la del server RSC).
 * `derivedPoints` = saldo FC derivado de displayRows (incluye optimistas) —
 *   alimenta cierre de semana y quiebre. El saldo banco hoy NO depende de
 *   mutaciones de grilla y sale de `projection.openingBalanceClp`.
 */
export function HealthHeader({
  projection,
  derivedPoints,
}: {
  projection: ProjectionMatrix;
  derivedPoints: { bucketKey: string; balanceClp: number }[];
}) {
  const opening = projection.openingBalanceClp;
  const todayIdx = currentBucketIndex(projection.buckets);
  const todayBucket = todayIdx >= 0 ? projection.buckets[todayIdx] : null;
  const todayClosing =
    todayIdx >= 0
      ? derivedPoints[todayIdx]?.balanceClp ?? opening
      : opening;

  const firstGap = derivedPoints.find((p) => p.balanceClp < 0) ?? null;
  const gapBucket = firstGap
    ? projection.buckets.find((b) => b.key === firstGap.bucketKey) ?? null
    : null;
  const gapIdx = gapBucket
    ? projection.buckets.findIndex((b) => b.key === gapBucket.key)
    : -1;
  // Semanas hasta el quiebre = distancia en buckets desde hoy (granularidad
  // semanal). El horizonte positivo es cuántas semanas cubre la proyección.
  const weeksToGap = gapIdx >= 0 ? Math.max(0, gapIdx - Math.max(todayIdx, 0)) : 0;
  const forwardWeeks = Math.max(1, projection.buckets.length - Math.max(todayIdx, 0));

  return (
    <div className="space-y-2">
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
        {firstGap && gapBucket ? (
          <CompactKPI
            label="Sin caja en"
            value={weekLabel(gapBucket.end)}
            hint={`en ${weeksToGap} ${weeksToGap === 1 ? "semana" : "semanas"} · faltan ${fmtCLP.format(Math.abs(firstGap.balanceClp))}`}
            Icon={AlertTriangle}
            tone={weeksToGap <= 4 ? "danger" : "warn"}
          />
        ) : (
          <CompactKPI
            label="Quiebre de caja"
            value="Sin quiebre"
            hint={`caja positiva las próximas ${forwardWeeks} semanas`}
            Icon={CheckCircle2}
            tone="ok"
          />
        )}
      </div>
      <AnchorChip anchor={projection.anchor} />
    </div>
  );
}
