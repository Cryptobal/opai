"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addMonths } from "date-fns";
import { toast } from "sonner";
import { Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
  ProjectionBucket,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { ManualCloseStreakBanner, type CloseLite } from "./ManualCloseStreakBanner";
import { WeekStrip } from "./WeekStrip";
import { WeekDetail } from "./WeekDetail";
import { WeekKanban } from "./WeekKanban";
import { UndoToast, type UndoPayload } from "./UndoToast";
import { MovementDetailSheet } from "./MovementDetailSheet";
import { CuadraturaModal } from "./CuadraturaModal";
import { Legend } from "./Legend";
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

type MoveConflict = {
  existingOccurrenceId: string;
  targetDate: string;
  suggestedFreeDate: string;
  reason: "same_level" | "target_is_stronger";
};

type MoveResult =
  | { ok: true; overwrote?: { occurrenceId: string; itemName: string } | null }
  | { ok: false; conflict?: MoveConflict; error?: string };

export interface CashflowV2ShellProps {
  /** Proyección semanal ya construida en el server (serializada a JSON:
   *  las fechas viajan como ISO string — usar new Date() al consumirlas). */
  projection: ProjectionMatrix;
  canManage: boolean;
  /** Anchor activo del cierre semanal (null si no hay). */
  anchor: ProjectionAnchorInfo | null;
  /** Últimos cierres semanales (para el banner de manuales consecutivos). */
  recentCloses?: CloseLite[];
}

/**
 * Flujo de Caja v2 — "la semana es el centro de comando".
 *
 * Desktop: kanban paralelo de 4 columnas. Mobile: strip + detalle de la semana
 * seleccionada. Sparkline de 13 semanas arriba, flechas ← → por fila para mover
 * con undo de 5s, y quick-add manual en cada sección.
 */
export function CashflowV2Shell({
  projection,
  canManage,
  anchor,
  recentCloses,
}: CashflowV2ShellProps) {
  const router = useRouter();
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [monthly, setMonthly] = useState<ProjectionMatrix | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [detail, setDetail] = useState<{
    occ: VirtualOccurrence;
    meta?: OccMeta;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    occ: VirtualOccurrence;
    destKey: string;
  } | null>(null);
  const [undoPayload, setUndoPayload] = useState<UndoPayload | null>(null);
  const [cuadraturaFor, setCuadraturaFor] = useState<ProjectionBucket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Ventana de 4 semanas en el kanban desktop. weekOffset corre la ventana
  // hacia adelante/atrás sobre los buckets ya proyectados (sin re-fetch).
  const [weekOffset, setWeekOffset] = useState(0);

  const active = granularity === "monthly" && monthly ? monthly : projection;
  const currentIndex = useMemo(() => currentBucketIndex(active.buckets), [active]);
  const VISIBLE_WEEKS = 4;
  const baseStart = Math.max(0, currentIndex - 1);
  const maxStart = Math.max(0, active.buckets.length - VISIBLE_WEEKS);
  const weekStartIdx = Math.min(Math.max(0, baseStart + weekOffset), maxStart);
  const canPrevWeeks = weekStartIdx > 0;
  const canNextWeeks = weekStartIdx < maxStart;
  // Clampa el offset al mover para que no se acumule fuera de rango.
  const shiftWeeks = (d: number) =>
    setWeekOffset((o) => {
      const next = Math.min(Math.max(0, baseStart + o + d), maxStart);
      return next - baseStart;
    });
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

  const selIdx = active.buckets.findIndex((b) => b.key === effectiveKey);
  const mobileCanLeft = selIdx > 0;
  const mobileCanRight = selIdx >= 0 && selIdx < active.buckets.length - 1;

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

  async function performMove(
    occ: VirtualOccurrence,
    destKey: string,
    opts?: { silent?: boolean },
  ): Promise<MoveResult> {
    const dest = active.buckets.find((b) => b.key === destKey);
    if (!dest) return { ok: false };
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
            // Si la fila viene de una factura/borrador enganchado a su
            // programación, mandamos el dteId para que la cuota materializada
            // quede "fuerte": así resolveCollisionAndMove consolida la sombra
            // del destino (la factura manda) en vez de devolver 409.
            dteId: occ.dteId ?? undefined,
          }),
        });
      } else if (occ.dteId) {
        // DTE huérfano sin programación: mover = override de fecha de
        // visibilidad. No toca el DTE.
        res = await fetch(`/api/finance/cashflow/dtes/${occ.dteId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newDate }),
        });
      } else {
        toast.error("Este movimiento no se puede mover");
        return { ok: false };
      }
      const j = await res.json();
      if (j?.success) {
        if (!opts?.silent) toast.success(`Movido a ${dest.label}`);
        router.refresh();
        return { ok: true, overwrote: j.overwrote ?? null };
      }
      // Colisión por jerarquía o por mismo nivel: mensaje de bloqueo claro.
      if (res.status === 409 && j?.conflict) {
        toast.error(j?.error ?? "No se puede mover a esa semana");
        return { ok: false, conflict: j.conflict as MoveConflict, error: j?.error };
      }
      const errMsg = j?.error ?? "No se pudo mover";
      // Semana cerrada: mensaje más persistente (6s) para que el usuario
      // alcance a leer la instrucción de reabrir antes de que desaparezca.
      toast.error(errMsg, {
        duration: errMsg.toLowerCase().includes("cerrada") ? 6000 : 4000,
      });
      return { ok: false, error: errMsg };
    } catch {
      toast.error("Error de red al mover");
      return { ok: false, error: "Error de red al mover" };
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveDir(
    occ: VirtualOccurrence,
    fromKey: string,
    dir: "left" | "right",
  ) {
    const fromIdx = active.buckets.findIndex((b) => b.key === fromKey);
    if (fromIdx < 0) return;
    const toIdx = dir === "left" ? fromIdx - 1 : fromIdx + 1;
    const dest = active.buckets[toIdx];
    const fromBucket = active.buckets[fromIdx];
    if (!dest) return;
    // Mover desde una semana cerrada exige confirmar la reapertura (sin undo).
    if (fromBucket && isBucketClosed(fromBucket, anchor)) {
      setPendingMove({ occ, destKey: dest.key });
      return;
    }
    const result = await performMove(occ, dest.key);
    // Si la colisión bloqueó el move (mismo nivel o destino más fuerte), o hubo
    // cualquier otro error, performMove ya mostró el toast: no se arma undo.
    if (!result.ok) return;
    // Toast informativo si se sobrescribió una proyección débil.
    if (result.overwrote) {
      toast.info(
        `Sobrescribió la proyección de ${result.overwrote.itemName} en ${dest.label}`,
        { duration: 4000 },
      );
    }
    // El undo reposiciona la cuota en su semana original. Tras el move la
    // occurrence quedó en dest.start, así que el reverse usa esa fecha como
    // origen (válido tanto para occurrences materializadas como virtuales).
    const movedOcc: VirtualOccurrence = { ...occ, scheduledDate: toDate(dest.start) };
    setUndoPayload({
      occurrenceName: occ.nickname ?? occ.name,
      destLabel: dest.label,
      undo: async () => {
        await performMove(movedOcc, fromKey);
      },
    });
  }

  async function handleDelete(occ: VirtualOccurrence) {
    if (!occ.id) return;
    const name = occ.nickname ?? occ.name;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/cashflow/occurrences/${occ.id}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo borrar");
        return;
      }
      toast.success(`Borrada la proyección "${name}"`);
      router.refresh();
    } catch {
      toast.error("Error de red al borrar");
    } finally {
      setSubmitting(false);
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
    <div className="min-w-0 space-y-4">
      <BancaTabsHeader active="cashflow" />
      {recentCloses && <ManualCloseStreakBanner recentCloses={recentCloses} />}
      <HealthHeader projection={projection} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-text-1">Línea de tiempo</h2>
        <div className="flex items-center gap-2">
          {granularity === "weekly" && (
            <div className="hidden items-center gap-1 lg:flex">
              <button
                type="button"
                onClick={() => shiftWeeks(-1)}
                disabled={!canPrevWeeks}
                aria-label="Semanas anteriores"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors",
                  canPrevWeeks
                    ? "hover:bg-ds-surface-2 hover:text-ds-text-1"
                    : "opacity-30",
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftWeeks(1)}
                disabled={!canNextWeeks}
                aria-label="Semanas siguientes"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors",
                  canNextWeeks
                    ? "hover:bg-ds-surface-2 hover:text-ds-text-1"
                    : "opacity-30",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <GranularityToggle
            value={granularity}
            onChange={handleGranularity}
            loading={loadingMonthly}
          />
        </div>
      </div>

      {/* Desktop (lg+) — kanban paralelo de columnas */}
      {granularity === "weekly" ? (
        <div className="hidden lg:block">
          <WeekKanban
            projection={active}
            anchor={anchor}
            meta={occMeta}
            canManage={canManage}
            visibleCount={VISIBLE_WEEKS}
            startIndex={weekStartIdx}
            searchTerm={searchTerm}
            onMoveDir={handleMoveDir}
            onDelete={handleDelete}
            onOpenDetail={(occ, meta) => setDetail({ occ, meta })}
            onCloseWeek={(key) => {
              const b = active.buckets.find((x) => x.key === key) ?? null;
              if (b) setCuadraturaFor(b);
            }}
            onMutate={() => router.refresh()}
          />
        </div>
      ) : null}

      {/* Mobile (lg-) — strip + detalle de la semana seleccionada */}
      <div className={cn(granularity === "weekly" && "lg:hidden")}>
        <WeekStrip
          projection={active}
          anchor={anchor}
          currentIndex={currentIndex}
          selectedKey={effectiveKey}
          onSelect={setSelectedKey}
        />

        {selectedBucket ? (
          <div className="mt-3 min-w-0 space-y-3">
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
                    onClick={() => setCuadraturaFor(selectedBucket)}
                  >
                    <Lock className="mr-1 h-3.5 w-3.5" /> Cuadrar y cerrar
                  </Button>
                )}
              </div>
            </div>
            <WeekDetail
              bucket={selectedBucket}
              meta={occMeta}
              canManage={canManage}
              searchTerm={searchTerm}
              onMoveDir={
                effectiveKey
                  ? (occ, dir) => handleMoveDir(occ, effectiveKey, dir)
                  : undefined
              }
              canMoveLeft={mobileCanLeft}
              canMoveRight={mobileCanRight}
              onDelete={handleDelete}
              onOpenDetail={(occ, meta) => setDetail({ occ, meta })}
              onMutate={() => router.refresh()}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-1 p-6 text-center text-sm text-ds-text-3">
            Sin bucket seleccionado
          </div>
        )}
      </div>

      <Legend />

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
      <CuadraturaModal
        open={cuadraturaFor != null}
        bucket={cuadraturaFor}
        canManage={canManage}
        onClose={() => setCuadraturaFor(null)}
      />
      <UndoToast payload={undoPayload} onDismiss={() => setUndoPayload(null)} />
    </div>
  );
}
