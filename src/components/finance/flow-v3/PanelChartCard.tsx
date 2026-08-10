"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState, SegmentedControl, Skeleton, Surface } from "@/components/opai-ds";
import type { PanelWeekPoint } from "@/modules/finance/flow-v3/insights-series";

const PanelBalanceChart = dynamic(
  () => import("./PanelBalanceChart").then((m) => m.PanelBalanceChart),
  { ssr: false, loading: () => <Skeleton className="h-60 w-full sm:h-80" /> },
);

export function PanelChartCard({
  weeks,
  currentWeek,
  buffer,
  onSelectWeek,
}: {
  weeks: PanelWeekPoint[];
  currentWeek: string;
  buffer: number;
  onSelectWeek?: (weekStart: string) => void;
}) {
  const [range, setRange] = useState<"12" | "26">("12");
  const [showHistory, setShowHistory] = useState(true);
  const [showFlow, setShowFlow] = useState(true);

  const chartWeeks = useMemo(() => {
    if (!weeks.length) return [];
    const curIdx = weeks.findIndex((w) => w.weekStart === currentWeek);
    if (range === "26") return weeks;
    const hist = showHistory ? 6 : 0;
    const from = Math.max(0, (curIdx < 0 ? 0 : curIdx) - hist);
    const to = Math.min(weeks.length, (curIdx < 0 ? 0 : curIdx) + 1 + 11);
    return weeks.slice(from, to);
  }, [weeks, currentWeek, range, showHistory]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
            Saldo proyectado
          </h3>
          <p className="text-[12px] text-ds-text-4">
            Histórico real/sellado + proyección
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="xs"
            ariaLabel="Horizonte"
            value={range}
            onChange={setRange}
            items={[
              { id: "12", label: "12 sem" },
              { id: "26", label: "26 sem" },
            ]}
          />
          <ToggleChip
            active={showHistory}
            onClick={() => setShowHistory((v) => !v)}
            label="Histórico"
          />
          <ToggleChip
            active={showFlow}
            onClick={() => setShowFlow((v) => !v)}
            label="Flujo semanal"
          />
        </div>
      </div>
      {chartWeeks.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin datos de flujo en el horizonte"
          description="No hay semanas en el rango seleccionado"
        />
      ) : (
        <PanelBalanceChart
          weeks={chartWeeks}
          buffer={buffer}
          currentWeek={currentWeek}
          showFlow={showFlow}
          onSelectWeek={onSelectWeek}
        />
      )}
    </Surface>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-[12px] font-medium sm:min-h-8 ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-ds-border-default bg-ds-surface-1 text-ds-text-3"
      }`}
    >
      {label}
    </button>
  );
}
