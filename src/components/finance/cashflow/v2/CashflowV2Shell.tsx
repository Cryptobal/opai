"use client";

import { useMemo, useState } from "react";
import { addMonths } from "date-fns";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { WeekStrip } from "./WeekStrip";
import { GranularityToggle, type Granularity } from "./GranularityToggle";
import { currentBucketIndex } from "./projection-helpers";

export interface CashflowV2ShellProps {
  /** Proyección semanal ya construida en el server (serializada a JSON:
   *  las fechas viajan como ISO string — usar new Date() al consumirlas). */
  projection: ProjectionMatrix;
  canManage: boolean;
  /** Anchor activo del cierre semanal (null si no hay). */
  anchor: ProjectionAnchorInfo | null;
}

/**
 * Flujo de Caja v2 — "la semana es el centro de comando".
 *
 * Orquesta el estado de la pantalla (granularidad, bucket seleccionado, cache
 * de la proyección mensual) y ensambla los bloques sobre la MISMA proyección
 * que ya construye el server. Solo lee endpoints/services existentes.
 */
export function CashflowV2Shell({ projection, canManage, anchor }: CashflowV2ShellProps) {
  void canManage;
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [monthly, setMonthly] = useState<ProjectionMatrix | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const active = granularity === "monthly" && monthly ? monthly : projection;
  const currentIndex = useMemo(() => currentBucketIndex(active.buckets), [active]);
  const effectiveKey =
    selectedKey ??
    active.buckets[currentIndex >= 0 ? currentIndex : 0]?.key ??
    null;
  const selectedBucket =
    active.buckets.find((b) => b.key === effectiveKey) ?? null;

  async function handleGranularity(g: Granularity) {
    setSelectedKey(null);
    if (g === "monthly" && !monthly) {
      setGranularity("monthly");
      setLoadingMonthly(true);
      try {
        const from = new Date();
        const to = addMonths(from, 12);
        const qs = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          granularity: "monthly",
        });
        const r = await fetch(`/api/finance/cashflow/projection?${qs.toString()}`);
        const j = await r.json();
        if (j?.success) setMonthly(j.data as ProjectionMatrix);
      } catch {
        setGranularity("weekly");
      } finally {
        setLoadingMonthly(false);
      }
    } else {
      setGranularity(g);
    }
  }

  return (
    <div className="space-y-4 min-w-0">
      <BancaTabsHeader active="cashflow" />
      <HealthHeader projection={projection} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-text-1">Línea de tiempo</h2>
        <GranularityToggle
          value={granularity}
          onChange={handleGranularity}
          loading={loadingMonthly}
        />
      </div>

      <WeekStrip
        projection={active}
        anchor={anchor}
        currentIndex={currentIndex}
        selectedKey={effectiveKey}
        onSelect={setSelectedKey}
      />

      <div className="rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-1 p-6 text-center text-sm text-ds-text-3">
        {selectedBucket
          ? `Detalle de ${selectedBucket.label} — en construcción`
          : "Sin bucket seleccionado"}
      </div>
    </div>
  );
}
