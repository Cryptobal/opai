"use client";

import { cn } from "@/lib/utils";
import { formatClpCompact, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import { shortStageName } from "./deals-helpers";
import type { CrmPipelineStage } from "@/types";
import type { DealsDensity, DealsPipelineSummary, DealsView } from "./types";

type Props = {
  openStages: CrmPipelineStage[];
  closedStages: CrmPipelineStage[];
  summary: DealsPipelineSummary;
  stageFilter: string;
  onStageFilter: (stageId: string) => void;
  onClosedStage: (stageId: string) => void;
  view: DealsView;
  onViewChange: (v: DealsView) => void;
  density: DealsDensity;
  onDensityChange: (d: DealsDensity) => void;
};

const DENSITY_LABEL: Record<DealsDensity, string> = {
  compact: "Compacta",
  normal: "Normal",
  detail: "Detalle",
};

export function PipelineRail({
  openStages,
  closedStages,
  summary,
  stageFilter,
  onStageFilter,
  onClosedStage,
  view,
  onViewChange,
  density,
  onDensityChange,
}: Props) {
  const openTotalClp = Math.max(1, summary.open.clp);
  const totalOpen = summary.open.count;

  return (
    <div className="shrink-0 space-y-2">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-ds-surface-2"
        role="img"
        aria-label="Distribución del pipeline abierto"
      >
        {openStages.map((stage) => {
          const clp = summary.stages[stage.id]?.clp ?? 0;
          const pct = Math.max(
            clp != null && clp > 0 ? (clp / openTotalClp) * 100 : 0,
            clp === 0 ? 0 : 2,
          );
          const color = sanitizeStageColor(stage.color) ?? "hsl(var(--ds-text-4))";
          const dimmed = stageFilter !== "all" && stageFilter !== stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              title={`${stage.name}: ${formatClpCompact(clp ?? 0)}`}
              onClick={() =>
                onStageFilter(stageFilter === stage.id ? "all" : stage.id)
              }
              className={cn("h-full transition-opacity", dimmed && "opacity-30")}
              style={{ width: `${pct}%`, backgroundColor: color }}
              aria-pressed={stageFilter === stage.id}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          pressed={stageFilter === "all" && view === "board"}
          onClick={() => {
            onStageFilter("all");
            if (view !== "board") onViewChange("board");
          }}
          label={`Todo el pipeline ${totalOpen}`}
        />
        {openStages.map((stage) => {
          const s = summary.stages[stage.id];
          const color = sanitizeStageColor(stage.color);
          return (
            <Chip
              key={stage.id}
              pressed={stageFilter === stage.id && view === "board"}
              onClick={() => {
                const next = stageFilter === stage.id ? "all" : stage.id;
                onStageFilter(next);
                if (view !== "board") onViewChange("board");
              }}
              color={color}
              label={`${shortStageName(stage.name)} ${s?.count ?? 0} · ${formatClpCompact(s?.clp ?? 0)}`}
            />
          );
        })}
      </div>

      {closedStages.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-ds-text-4">Cerradas</span>
          {closedStages.map((stage) => {
            const count =
              summary.closedCounts[stage.id] ??
              summary.stages[stage.id]?.count ??
              0;
            const active = view === "table" && stageFilter === stage.id;
            return (
              <Chip
                key={stage.id}
                dashed
                pressed={active}
                onClick={() => onClosedStage(stage.id)}
                label={`${shortStageName(stage.name)} ${count}`}
                title="Abrir vista Tabla filtrada"
              />
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["board", "table", "focus"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onViewChange(v)}
            className={cn(
              "deals-touch rounded-md px-2.5 text-[12px] font-medium",
              view === v
                ? "bg-ds-surface-3 text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            {v === "board" ? "Tablero" : v === "table" ? "Tabla" : "Foco"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ds-border-subtle" aria-hidden />
        <span className="text-[12px] text-ds-text-4">Densidad</span>
        {(["compact", "normal", "detail"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={density === d}
            onClick={() => onDensityChange(d)}
            className={cn(
              "deals-touch rounded-md px-2.5 text-[12px]",
              density === d
                ? "bg-ds-surface-3 text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
            title={DENSITY_LABEL[d]}
          >
            {DENSITY_LABEL[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  pressed,
  onClick,
  color,
  dashed,
  title,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  color?: string | null;
  dashed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        "deals-touch inline-flex items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
        dashed && "border-dashed",
        pressed
          ? "border-ds-border-strong bg-ds-surface-3 text-ds-text-1"
          : "border-ds-border-subtle bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2",
      )}
    >
      {color ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}
