"use client";

import { cn } from "@/lib/utils";
import {
  Bar,
  Pill,
  StatusDot,
  thresholdBorderLeft,
  thresholdFromScore,
  thresholdText,
  type Threshold,
} from "./_primitives";
import type { OverviewInstallation } from "@/lib/protocols/knowledge-aggregator-types";

function thresholdFromStatus(
  status: OverviewInstallation["status"],
  score: number | null,
): Threshold {
  if (status === "no_protocol" || status === "no_evaluated") return "neutral";
  if (status === "critical") return "danger";
  if (status === "warning") return "warn";
  if (status === "ok") return "ok";
  return thresholdFromScore(score);
}

const ICON_TILE_STYLE: Record<Threshold, string> = {
  ok: "bg-emerald-500/10 border border-emerald-500/20",
  warn: "bg-amber-500/10 border border-amber-500/20",
  danger: "bg-red-500/10 border border-red-500/20",
  neutral: "bg-white/[0.03] border border-white/10 border-dashed opacity-60",
};

/**
 * Compact, square-ish tile used in the cross-installation grid view.
 * Built on the same primitives as InstallationCard but with a denser
 * layout so the user can scan many installations at once.
 */
export function InstallationTile({
  data,
  onClick,
}: {
  data: OverviewInstallation;
  onClick: () => void;
}) {
  const t = thresholdFromStatus(data.status, data.avgScore);
  const accountLine = [data.accountName, data.commune]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left card-mock p-3 tap-mock relative overflow-hidden h-full flex flex-col"
    >
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          thresholdBorderLeft(t),
        )}
      />

      {/* Encabezado: icono + score */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "w-9 h-9 rounded-lg grid place-items-center shrink-0 text-base",
            ICON_TILE_STYLE[t],
          )}
        >
          {data.icon}
        </div>
        {data.avgScore !== null ? (
          <div className="text-right">
            <div
              className={cn(
                "font-display text-lg font-bold num-tabular leading-none",
                thresholdText(t),
              )}
            >
              {Math.round(data.avgScore)}
              <span className="text-xs">%</span>
            </div>
            <div className="text-[9px] text-white/40 font-mono mt-0.5">
              cumpl.
            </div>
          </div>
        ) : (
          <div className="text-[9px] text-white/40 font-mono leading-tight text-right max-w-[60%]">
            {data.hasProtocol ? "Sin evaluar" : "Sin protocolo"}
          </div>
        )}
      </div>

      {/* Nombre + cuenta */}
      <div className="mt-2 min-w-0">
        <div className="font-display font-semibold text-[12.5px] leading-tight line-clamp-2">
          {data.name}
        </div>
        <div className="text-[10px] text-white/40 truncate mt-0.5">
          {accountLine || "—"}
        </div>
      </div>

      {/* Barra */}
      {data.avgScore !== null && (
        <Bar value={data.avgScore} threshold={t} className="mt-2" />
      )}

      {/* Meta + pills siempre al fondo */}
      <div className="mt-auto pt-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[9.5px] text-white/50 font-mono">
          {data.hasProtocol && (
            <span className="flex items-center gap-1">
              <StatusDot threshold="ok" />v{data.protocolVersion ?? 1}
            </span>
          )}
          <span className="truncate">
            {data.evaluatedGuards}/{data.activeGuards}
          </span>
        </div>
        {(data.failedCount > 0 ||
          data.pendingCount > 0 ||
          !data.hasProtocol) && (
          <div className="flex items-center gap-1 flex-wrap">
            {data.failedCount > 0 && (
              <Pill variant="danger">⚠ {data.failedCount}</Pill>
            )}
            {data.pendingCount > 0 && (
              <Pill variant="warn">{data.pendingCount} pend.</Pill>
            )}
            {!data.hasProtocol && (
              <Pill variant="neutral">📋 sin protocolo</Pill>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
