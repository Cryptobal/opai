"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addMonths } from "date-fns";
import { toast } from "sonner";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { WeekStrip } from "./WeekStrip";
import { WeekDetail } from "./WeekDetail";
import { MovePicker } from "./MovePicker";
import { ClosedWeekModal } from "./ClosedWeekModal";
import { GranularityToggle, type Granularity } from "./GranularityToggle";
import {
  currentBucketIndex,
  buildOccurrenceMeta,
  isBucketClosed,
} from "./projection-helpers";
import { toDate } from "./format";

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
  const router = useRouter();
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [monthly, setMonthly] = useState<ProjectionMatrix | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [moveOcc, setMoveOcc] = useState<VirtualOccurrence | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    occ: VirtualOccurrence;
    destKey: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const active = granularity === "monthly" && monthly ? monthly : projection;
  const currentIndex = useMemo(() => currentBucketIndex(active.buckets), [active]);
  const effectiveKey =
    selectedKey ??
    active.buckets[currentIndex >= 0 ? currentIndex : 0]?.key ??
    null;
  const selectedBucket =
    active.buckets.find((b) => b.key === effectiveKey) ?? null;
  const occMeta = useMemo(() => buildOccurrenceMeta(active), [active]);

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

  async function performMove(occ: VirtualOccurrence, destKey: string) {
    const dest = active.buckets.find((b) => b.key === destKey);
    if (!dest) return;
    const newDate = toDate(dest.start).toISOString().slice(0, 10);
    setSubmitting(true);
    try {
      let res: Response;
      if (occ.id) {
        res = await fetch(`/api/finance/cashflow/occurrences/${occ.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newDate }),
        });
      } else if (occ.itemId) {
        res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            itemId: occ.itemId,
            originalDate: toDate(occ.scheduledDate).toISOString().slice(0, 10),
            newDate,
          }),
        });
      } else {
        toast.error("Este movimiento no se puede mover");
        return;
      }
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo mover");
        return;
      }
      toast.success(`Movido a ${dest.label}`);
      router.refresh();
    } catch {
      toast.error("Error de red al mover");
    } finally {
      setSubmitting(false);
    }
  }

  function handleChooseDest(destKey: string) {
    const occ = moveOcc;
    if (!occ) return;
    setMoveOcc(null);
    // Si el bucket origen está cerrado, primero hay que confirmar la reapertura.
    if (selectedBucket && isBucketClosed(selectedBucket, anchor)) {
      setPendingMove({ occ, destKey });
    } else {
      void performMove(occ, destKey);
    }
  }

  async function handleReopen() {
    if (!pendingMove || !anchor) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/cashflow/weekly-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekEnd: toDate(anchor.weekEndDate).toISOString(),
          anchor: false,
        }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo reabrir la semana");
        return;
      }
      toast.success("Semana reabierta");
      await performMove(pendingMove.occ, pendingMove.destKey);
    } catch {
      toast.error("Error al reabrir la semana");
    } finally {
      setPendingMove(null);
      setSubmitting(false);
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

      {selectedBucket ? (
        <WeekDetail
          bucket={selectedBucket}
          meta={occMeta}
          canManage={canManage}
          onMove={setMoveOcc}
        />
      ) : (
        <div className="rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-1 p-6 text-center text-sm text-ds-text-3">
          Sin bucket seleccionado
        </div>
      )}

      <MovePicker
        open={moveOcc != null}
        projection={active}
        anchor={anchor}
        excludeKey={effectiveKey}
        onChoose={handleChooseDest}
        onClose={() => setMoveOcc(null)}
      />
      <ClosedWeekModal
        open={pendingMove != null}
        weekEndDate={anchor?.weekEndDate ?? null}
        balanceClp={anchor?.bankBalanceClp ?? null}
        submitting={submitting}
        onCancel={() => setPendingMove(null)}
        onReopen={handleReopen}
      />
    </div>
  );
}
