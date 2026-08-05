"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { formatClpCompact, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import { shortStageName } from "./deals-helpers";
import type { CrmPipelineStage } from "@/types";

type Props = {
  stage: CrmPipelineStage;
  count: number;
  total: number;
  clp: number | null;
  uf: number | null;
  children?: ReactNode;
  collapsed?: boolean;
  /** Columna cerrada (ganado/perdido): siempre contraída, abre Tabla. */
  closedRail?: boolean;
  onToggleCollapse?: () => void;
  onClosedOpen?: () => void;
  highlightDropTarget?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onAddDeal?: () => void;
  loadedCount?: number;
};

export function DealColumn({
  stage,
  count,
  total,
  clp,
  uf,
  children,
  collapsed = false,
  closedRail = false,
  onToggleCollapse,
  onClosedOpen,
  highlightDropTarget = false,
  loading = false,
  hasMore = false,
  onLoadMore,
  onAddDeal,
  loadedCount = 0,
}: Props) {
  const { setNodeRef: setColumnNodeRef, isOver: isOverColumn } = useDroppable({
    id: `stage-${stage.id}`,
  });
  const { setNodeRef: setHeaderNodeRef, isOver: isOverHeader } = useDroppable({
    id: `stage-header-${stage.id}`,
  });

  const stageColor = sanitizeStageColor(stage.color) ?? "hsl(var(--ds-text-4))";
  const isOver = isOverColumn || isOverHeader || highlightDropTarget;
  const amountLabel = clp != null ? formatClpCompact(clp) : "—";

  if (collapsed || closedRail) {
    return (
      <div
        ref={setColumnNodeRef}
        className={cn(
          "deals-col-collapsed flex h-full min-h-0 flex-none flex-col overflow-hidden rounded-lg border bg-ds-surface-2",
          isOver ? "border-primary/60 bg-primary/5" : "border-ds-border-subtle",
          closedRail && "border-dashed",
        )}
      >
        <button
          type="button"
          ref={setHeaderNodeRef}
          onClick={closedRail ? onClosedOpen : onToggleCollapse}
          className="deals-touch flex h-full min-h-0 flex-col items-stretch gap-2 px-2.5 py-3 text-left"
          style={{
            backgroundColor: `${stageColor}14`,
            borderLeft: `3px solid ${stageColor}`,
          }}
          title={
            closedRail
              ? `Ver ${stage.name} en tabla (${count})`
              : `Expandir ${stage.name}`
          }
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stageColor }}
          />
          <span
            className="text-[12px] font-semibold leading-tight text-ds-text-1"
            style={{ color: stageColor }}
          >
            {shortStageName(stage.name)}
          </span>
          <span className="ds-num text-[13px] font-semibold text-ds-text-1">
            {count}
          </span>
          <span className="ds-num text-[12px] text-ds-text-2">{amountLabel}</span>
          <span className="mt-auto text-ds-text-3" aria-hidden>
            {closedRail ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
            )}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setColumnNodeRef}
      className={cn(
        "deals-col flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-ds-surface-2",
        isOver ? "border-primary/60 bg-primary/5" : "border-ds-border-subtle",
      )}
    >
      <div
        ref={setHeaderNodeRef}
        role={onToggleCollapse ? "button" : undefined}
        tabIndex={onToggleCollapse ? 0 : undefined}
        onClick={onToggleCollapse}
        onKeyDown={
          onToggleCollapse
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleCollapse();
                }
              }
            : undefined
        }
        className={cn(
          "deals-touch flex shrink-0 items-center justify-between gap-2 border-b border-ds-border-subtle px-2.5 py-2",
          "backdrop-blur-md",
          onToggleCollapse && "cursor-pointer hover:opacity-90",
        )}
        style={{
          borderLeft: `3px solid ${stageColor}`,
          background: "var(--glass-fill)",
        }}
      >
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          style={{ color: stageColor }}
          title={stage.name}
        >
          {shortStageName(stage.name)}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-ds-text-3">
          {count} · {amountLabel}
          {uf != null && uf > 0 ? (
            <span className="deals-col-uf">
              {" "}
              · {uf.toLocaleString("es-CL", { maximumFractionDigits: 1 })} UF
            </span>
          ) : null}
        </span>
        {onToggleCollapse ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
        ) : null}
      </div>

      <div className="deals-col-body relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loading && loadedCount === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          children
        )}
      </div>

      <div className="shrink-0 space-y-1 border-t border-ds-border-subtle p-2">
        {hasMore || loadedCount < total ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="deals-touch w-full text-center text-[12px] text-ds-text-3 hover:text-ds-text-1"
          >
            Mostrando {loadedCount} de {total}
            {hasMore ? " · Cargar más" : ""}
          </button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="deals-touch h-10 w-full justify-start text-[12px] sm:h-8"
          onClick={onAddDeal}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Agregar negocio
        </Button>
      </div>
    </div>
  );
}
