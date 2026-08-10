"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState, Spinner } from "@/components/opai-ds";
import {
  CarteraPendienteSheet,
  type CarteraItem,
  type OpenMoveWeek,
} from "./CarteraPendienteSheet";
import { PanelChartCard } from "./PanelChartCard";
import { PanelCollections, type AgingMode } from "./PanelCollections";
import { PanelDataHealth } from "./PanelDataHealth";
import { PanelKpis } from "./PanelKpis";
import { PanelMonthlyDrift } from "./PanelMonthlyDrift";
import { PanelSeals } from "./PanelSeals";
import { PanelTopMovers } from "./PanelTopMovers";
import {
  invalidatePanelInsightsCache,
  usePanelInsights,
} from "./usePanelInsights";

export function PanelView({
  canManage,
  onViewDte,
  onJumpToWeek,
  onOpenBank,
  onJumpToRow,
}: {
  canManage: boolean;
  onViewDte?: (dteId: string) => void;
  onJumpToWeek?: (weekStart: string) => void;
  onOpenBank?: () => void;
  onJumpToRow?: (rowId: string) => void;
}) {
  const { data, error, loading, load } = usePanelInsights();
  const [carteraOpen, setCarteraOpen] = useState(false);
  const [agingMode, setAgingMode] = useState<AgingMode>("due");
  const [futureDated, setFutureDated] = useState<
    Array<{
      dteId: string;
      folio: number;
      receiverName: string;
      docDateYmd: string;
      sendYmd: string;
      amountClp: number;
    }>
  >([]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void fetch("/api/finance/flow-v3/reanchor-to-send", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.success && !cancelled) setFutureDated(j.data ?? []);
      })
      .catch(() => { /* no-op */ });
    return () => { cancelled = true; };
  }, [canManage]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center"><Spinner /></div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState icon={BarChart3} title="No se pudo cargar el panel" description={error ?? "Sin datos"} />
    );
  }

  const buffer = data.bufferClp ?? data.warnThresholdClp ?? 0;
  const due = data.agingByDue ?? data.aging;
  const overdueClp = due.d1_15 + due.d16_30 + due.d30plus;
  const overduePct = data.porCobrarTotal > 0
    ? Math.round((overdueClp / data.porCobrarTotal) * 100) : 0;
  const refresh = () => { invalidatePanelInsightsCache(); void load(true); };

  return (
    <div className="ds-page-enter space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <PanelDataHealth
        health={data.dataHealth}
        saldoHoy={data.saldoHoy}
        onOpenBank={onOpenBank}
      />
      <PanelKpis
        saldoHoy={data.saldoHoy}
        buffer={buffer}
        kpis={data.kpis}
        weeks={data.weeks}
        accounts={data.dataHealth.accounts}
        bankAsOfYmd={data.dataHealth.bankAsOfYmd}
        porCobrarTotal={data.porCobrarTotal}
        carteraCount={data.cartera?.length ?? 0}
        overdueClp={overdueClp}
        overduePct={overduePct}
        onOpenBank={onOpenBank}
        onJumpToWeek={onJumpToWeek}
        onOpenCartera={() => setCarteraOpen(true)}
      />
      <PanelChartCard
        weeks={data.weeks}
        currentWeek={data.currentWeek}
        buffer={buffer}
        onSelectWeek={onJumpToWeek}
      />
      <PanelCollections
        agingByIssue={data.aging}
        agingByDue={due}
        mode={agingMode}
        onModeChange={setAgingMode}
        carteraCount={data.cartera?.length ?? 0}
        onOpenCartera={() => setCarteraOpen(true)}
        collectionLagDays={data.agingMeta?.collectionLagDays ?? 30}
      />
      <PanelTopMovers movers={data.topMovers} onSelectRow={onJumpToRow} />
      <PanelMonthlyDrift
        rows={data.monthlyDrifts ?? []}
        onSelectCell={(rowId) => onJumpToRow?.(rowId)}
      />
      <PanelSeals
        recentSeals={data.recentSeals}
        canManage={canManage}
        futureDated={futureDated}
        onViewDte={onViewDte}
        onReanchored={() => {
          setFutureDated([]);
          refresh();
        }}
      />
      <CarteraPendienteSheet
        open={carteraOpen}
        onOpenChange={setCarteraOpen}
        items={(data.cartera ?? []) as CarteraItem[]}
        openMoveWeeks={(data.openMoveWeeks ?? []) as OpenMoveWeek[]}
        canManage={canManage}
        onViewDte={onViewDte}
        onMoved={refresh}
      />
    </div>
  );
}
