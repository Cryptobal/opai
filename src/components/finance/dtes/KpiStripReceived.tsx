"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  TrendingDown,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Wallet,
} from "lucide-react";
import { KPICard, Skeleton } from "@/components/opai-ds";
import { fmtCLP } from "./shared/constants";

interface KpisReceivedData {
  totalReceived: {
    count: number;
    amount: number;
    sparkline: number[];
  };
  accepted: { count: number; pctOfTotal: number };
  pendingReview: {
    count: number;
    amount: number;
    oldestDateIso: string | null;
    oldestFolio: number | null;
  };
  claimed: { count: number; amount: number };
  toPay: { count: number; amount: number };
}

interface Props {
  periodo: string;
  accountId: string;
  installationId: string;
  onClickAccepted?: () => void;
  onClickPending?: () => void;
  onClickClaimed?: () => void;
  onClickToPay?: () => void;
}

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

export function KpiStripReceived({
  periodo,
  accountId,
  installationId,
  onClickAccepted,
  onClickPending,
  onClickClaimed,
  onClickToPay,
}: Props) {
  const [data, setData] = useState<KpisReceivedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    params.set("periodo", periodo);
    if (accountId !== "ALL") params.set("accountId", accountId);
    if (installationId !== "ALL") params.set("installationId", installationId);
    setLoading(true);
    fetch(`/api/finance/billing/kpis-received?${params.toString()}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setData(j.data);
      })
      .catch(() => {})
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

  const totalAmount = data?.totalReceived.amount ?? 0;
  const totalCount = data?.totalReceived.count ?? 0;
  const sparkValues = data?.totalReceived.sparkline ?? [];
  const acceptedCount = data?.accepted.count ?? 0;
  const acceptedPct = data?.accepted.pctOfTotal ?? 0;
  const pendingCount = data?.pendingReview.count ?? 0;
  const pendingAmount = data?.pendingReview.amount ?? 0;
  const oldestDate = data?.pendingReview.oldestDateIso
    ? new Date(data.pendingReview.oldestDateIso)
    : null;
  const oldestFolio = data?.pendingReview.oldestFolio ?? null;
  const claimedCount = data?.claimed.count ?? 0;
  const claimedAmount = data?.claimed.amount ?? 0;
  const toPayCount = data?.toPay.count ?? 0;
  const toPayAmount = data?.toPay.amount ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KPICard
        label="Total recibido"
        value={fmtCLP.format(totalAmount)}
        hint={
          <span className="flex items-center gap-2">
            <span>{totalCount} docs</span>
            {sparkValues.length > 0 && <Sparkline values={sparkValues} />}
          </span>
        }
        icon={TrendingDown}
        iconVariant="brand"
      />

      <KPICard
        label="Aceptados SII"
        value={`${acceptedPct}%`}
        hint={`${acceptedCount} de ${totalCount}`}
        icon={CheckCircle2}
        variant="ok"
        onClick={onClickAccepted}
      />

      <KPICard
        label="Pendiente acuse"
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
        label="Reclamados"
        value={claimedCount}
        hint={claimedCount > 0 ? fmtCLP.format(claimedAmount) : "Sin reclamos"}
        icon={AlertOctagon}
        variant="danger"
        onClick={onClickClaimed}
      />

      <KPICard
        label="Por pagar"
        value={fmtCLP.format(toPayAmount)}
        hint={toPayCount > 0 ? `${toPayCount} factura${toPayCount === 1 ? "" : "s"}` : "Sin deuda"}
        icon={Wallet}
        variant="brand"
        onClick={onClickToPay}
      />
    </div>
  );
}
