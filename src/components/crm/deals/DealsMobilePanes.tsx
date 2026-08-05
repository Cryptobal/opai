"use client";

import { useEffect, useRef } from "react";
import type { CrmDeal, CrmPipelineStage } from "@/types";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";
import { formatClpCompact, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import { shortStageName } from "./deals-helpers";
import { DealCard } from "./DealCard";
import type { DealsDensity, StageColumnState } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  stages: CrmPipelineStage[];
  byStage: Record<string, StageColumnState>;
  summary: DealsPipelineSummary;
  activeStageId: string;
  onActiveStageChange: (id: string) => void;
  density: DealsDensity;
  unreadNoteIds: Set<string>;
  onOpenDeal: (id: string) => void;
  onLoadMore: (stageId: string) => void;
};

export function DealsMobilePanes({
  stages,
  byStage,
  summary,
  activeStageId,
  onActiveStageChange,
  density,
  unreadNoteIds,
  onOpenDeal,
  onLoadMore,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const indexOf = (id: string) => Math.max(0, stages.findIndex((s) => s.id === id));

  useEffect(() => {
    const idx = indexOf(activeStageId);
    const pane = panesRef.current;
    const rail = railRef.current;
    if (!pane) return;
    syncing.current = true;
    const w = pane.clientWidth;
    pane.scrollTo({ left: idx * w, behavior: "smooth" });
    const chip = rail?.querySelector<HTMLElement>(`[data-stage="${activeStageId}"]`);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => {
      syncing.current = false;
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageId, stages.length]);

  useEffect(() => {
    const pane = panesRef.current;
    if (!pane) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (syncing.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const idx = Math.round(pane.scrollLeft / Math.max(1, pane.clientWidth));
        const stage = stages[idx];
        if (stage && stage.id !== activeStageId) onActiveStageChange(stage.id);
      }, 90);
    };
    pane.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      pane.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [stages, activeStageId, onActiveStageChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 md:hidden">
      <div
        ref={railRef}
        role="tablist"
        aria-label="Etapas del pipeline"
        className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1"
      >
        {stages.map((stage) => {
          const count =
            summary.stages[stage.id]?.count ??
            summary.closedCounts[stage.id] ??
            0;
          const color = sanitizeStageColor(stage.color);
          const active = stage.id === activeStageId;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-stage={stage.id}
              onClick={() => onActiveStageChange(stage.id)}
              className={cn(
                "deals-touch snap-start shrink-0 rounded-full border px-3 text-[12px] font-medium",
                active
                  ? "border-ds-border-default bg-ds-surface-3 text-ds-text-1"
                  : "border-ds-border-subtle bg-ds-surface-1 text-ds-text-2",
                (stage.isClosedWon || stage.isClosedLost) && "border-dashed",
              )}
            >
              {color ? (
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ) : null}
              {shortStageName(stage.name)} {count}
            </button>
          );
        })}
      </div>

      <div
        ref={panesRef}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {stages.map((stage) => {
          const col = byStage[stage.id];
          const deals: CrmDeal[] = col?.deals ?? [];
          const isClosed = stage.isClosedWon || stage.isClosedLost;
          return (
            <div
              key={stage.id}
              className="w-full shrink-0 snap-center space-y-1.5 overflow-y-auto px-0.5"
            >
              {isClosed && deals.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ds-text-3">
                  Abre la vista Tabla para ver los {summary.closedCounts[stage.id] ?? 0} negocios.
                </p>
              ) : null}
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  density={density}
                  onOpen={() => onOpenDeal(deal.id)}
                  hasUnreadNotes={unreadNoteIds.has(deal.id)}
                />
              ))}
              {col?.hasMore ? (
                <button
                  type="button"
                  className="deals-touch w-full py-2 text-[12px] text-ds-text-3"
                  onClick={() => onLoadMore(stage.id)}
                >
                  Mostrando {deals.length} de {col.total} · Cargar más
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className="opai-glass-strong fixed inset-x-3 bottom-0 z-20 flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-[12px] tabular-nums"
        style={{ marginBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <span className="text-ds-text-2">
          {formatClpCompact(summary.open.clp)}
          <span className="text-ds-text-4"> abierto</span>
        </span>
        <span className="text-ds-text-2">{formatClpCompact(summary.open.weightedClp)} pond.</span>
        <span className="text-ds-text-2">{summary.open.guards} puestos</span>
      </div>
    </div>
  );
}
