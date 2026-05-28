"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addMonths } from "date-fns";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { AnchorBanner } from "./AnchorBanner";
import { WeekStrip } from "./WeekStrip";
import { WeekDetail } from "./WeekDetail";
import { MovementDetailSheet } from "./MovementDetailSheet";
import { ReconcileBand } from "./ReconcileBand";
import { Legend } from "./Legend";
import { MovePicker } from "./MovePicker";
import { ClosedWeekModal } from "./ClosedWeekModal";
import { GranularityToggle, type Granularity } from "./GranularityToggle";
import {
  currentBucketIndex,
  buildOccurrenceMeta,
  isBucketClosed,
  isCurrentOrPast,
  type OccMeta,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [moveOcc, setMoveOcc] = useState<VirtualOccurrence | null>(null);
  const [detail, setDetail] = useState<{
    occ: VirtualOccurrence;
    meta?: OccMeta;
  } | null>(null);
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
  // Cerrar/conciliar son conceptos semanales y solo aplican a una semana que
  // ya empezó y sigue abierta (sin anchor que la selle).
  const bucketActionable =
    !!selectedBucket &&
    granularity === "weekly" &&
    isCurrentOrPast(selectedBucket) &&
    !isBucketClosed(selectedBucket, anchor);

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

  async function handleCloseWeek() {
    if (!selectedBucket) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/cashflow/weekly-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekEnd: toDate(selectedBucket.end).toISOString(),
          anchor: true,
        }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo cerrar la semana");
        return;
      }
      toast.success("Semana cerrada y proyección anclada");
      router.refresh();
    } catch {
      toast.error("Error al cerrar la semana");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 min-w-0">
      <BancaTabsHeader active="cashflow" />
      <HealthHeader projection={projection} />
      <AnchorBanner anchor={anchor} />

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
        // Móvil = 1 columna (detalle → conciliación). lg+ = split: detalle a la
        // izquierda (col-span-3) y conciliación a la derecha (col-span-2). Si la
        // semana no es accionable (futura/cerrada) el detalle ocupa todo el ancho.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div
            className={cn(
              "min-w-0 space-y-3",
              bucketActionable ? "lg:col-span-3" : "lg:col-span-5",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ds-text-1">
                {selectedBucket.label}
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar…"
                  aria-label="Buscar en el detalle de la semana"
                  className="h-9 w-36 rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-2.5 text-base placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary sm:w-44 sm:text-[13px]"
                />
                {bucketActionable && canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-[12px]"
                    disabled={submitting}
                    onClick={handleCloseWeek}
                  >
                    <Lock className="mr-1 h-3.5 w-3.5" /> Cerrar semana
                  </Button>
                )}
              </div>
            </div>
            <WeekDetail
              bucket={selectedBucket}
              meta={occMeta}
              canManage={canManage}
              searchTerm={searchTerm}
              onMove={setMoveOcc}
              onOpenDetail={(occ, meta) => setDetail({ occ, meta })}
            />
          </div>
          {bucketActionable && (
            <div className="min-w-0 lg:col-span-2">
              <ReconcileBand bucket={selectedBucket} />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-1 p-6 text-center text-sm text-ds-text-3">
          Sin bucket seleccionado
        </div>
      )}

      <Legend />

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
      <MovementDetailSheet
        occ={detail?.occ ?? null}
        meta={detail?.meta}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
