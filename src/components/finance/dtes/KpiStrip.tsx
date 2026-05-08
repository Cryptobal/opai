"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  Ban,
  Coins,
} from "lucide-react";
import { KPICard, Skeleton } from "@/components/opai-ds";
import { fmtCLP } from "./shared/constants";

interface SparklinePoint {
  monthIso: string;
  amount: number;
}

interface KpisIssuedData {
  totalEmitted: {
    count: number;
    amount: number;
    sparkline: number[];
    sparklinePoints?: SparklinePoint[];
  };
  accepted: { count: number; pctOfTotal: number };
  pending: {
    count: number;
    amount: number;
    oldestFolio: number | null;
    oldestDateIso: string | null;
  };
  annulled: { count: number; amount: number };
  ceded: { count: number; amount: number };
  periodLabel?: string;
}

interface Props {
  periodo: string;
  accountId: string;
  installationId: string;
  /** Click handlers para deeplinks dentro del listado (no a otra ruta).
   *  El padre los implementa actualizando los filtros locales. */
  onClickAccepted?: () => void;
  onClickPending?: () => void;
  onClickAnnulled?: () => void;
  onClickCeded?: () => void;
}

/**
 * Sparkline minimalista 80x24px usando SVG inline (sin recharts).
 * Renderiza polyline + área tenue debajo.
 */
function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden
    >
      <polygon points={areaPoints} className="fill-primary/15" />
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        className="stroke-primary"
      />
    </svg>
  );
}

export function KpiStrip({
  periodo,
  accountId,
  installationId,
  onClickAccepted,
  onClickPending,
  onClickAnnulled,
  onClickCeded,
}: Props) {
  const [data, setData] = useState<KpisIssuedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    params.set("periodo", periodo);
    if (accountId !== "ALL") params.set("accountId", accountId);
    if (installationId !== "ALL") params.set("installationId", installationId);
    setLoading(true);
    fetch(`/api/finance/billing/kpis-issued?${params.toString()}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setData(j.data);
      })
      .catch(() => {
        // silencioso: la card mostrará "—"
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [periodo, accountId, installationId]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-ds-md" />
        ))}
      </div>
    );
  }

  const totalEmittedAmount = data?.totalEmitted.amount ?? 0;
  const totalEmittedCount = data?.totalEmitted.count ?? 0;
  const sparkValues = data?.totalEmitted.sparkline ?? [];
  const acceptedCount = data?.accepted.count ?? 0;
  const acceptedPct = data?.accepted.pctOfTotal ?? 0;
  const pendingCount = data?.pending.count ?? 0;
  const pendingAmount = data?.pending.amount ?? 0;
  const oldestFolio = data?.pending.oldestFolio ?? null;
  const oldestDate = data?.pending.oldestDateIso
    ? new Date(data.pending.oldestDateIso)
    : null;
  const annulledCount = data?.annulled.count ?? 0;
  const annulledAmount = data?.annulled.amount ?? 0;
  const cededCount = data?.ceded.count ?? 0;
  const cededAmount = data?.ceded.amount ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KPICard
        label="Total emitido"
        value={fmtCLP.format(totalEmittedAmount)}
        hint={
          <span className="flex items-center gap-2">
            <span>{totalEmittedCount} docs</span>
            {sparkValues.length > 0 && <Sparkline values={sparkValues} />}
          </span>
        }
        icon={TrendingUp}
        iconVariant="brand"
      />

      <KPICard
        label="Aceptado SII"
        value={`${acceptedPct}%`}
        hint={`${acceptedCount} de ${totalEmittedCount}`}
        icon={CheckCircle2}
        variant="ok"
        onClick={onClickAccepted}
      />

      <KPICard
        label="Pendiente SII"
        value={pendingCount}
        hint={
          oldestFolio != null && oldestDate
            ? `${fmtCLP.format(pendingAmount)} · más antiguo F#${oldestFolio} · ${format(oldestDate, "dd MMM", { locale: es })}`
            : pendingCount > 0
              ? fmtCLP.format(pendingAmount)
              : "Sin pendientes"
        }
        icon={Clock}
        variant="warn"
        onClick={onClickPending}
      />

      <KPICard
        label="Anulado"
        value={annulledCount}
        hint={annulledCount > 0 ? fmtCLP.format(annulledAmount) : "Sin anulados"}
        icon={Ban}
        variant="danger"
        onClick={onClickAnnulled}
      />

      <KPICard
        label="Cedido factoring"
        value={cededCount}
        hint={cededCount > 0 ? fmtCLP.format(cededAmount) : "Sin cesiones"}
        icon={Coins}
        variant="brand"
        onClick={onClickCeded}
      />
    </div>
  );
}
