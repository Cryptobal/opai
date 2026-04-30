"use client";

import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Surface,
  Tag,
  StatusDot,
  MetricBar,
  thresholdFromScore,
  type Threshold,
} from "@/components/opai-ds";
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

const VALUE_COLOR: Record<Threshold, string> = {
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  neutral: "text-ds-text-3",
};

const ICON_TILE: Record<Threshold, string> = {
  ok:      "bg-status-ok-soft border border-status-ok-border",
  warn:    "bg-status-warn-soft border border-status-warn-border",
  danger:  "bg-status-danger-soft border border-status-danger-border",
  neutral: "bg-ds-surface-2 border border-dashed border-ds-border-default opacity-60",
};

const ACCENT_FROM_THRESHOLD = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  neutral: "neutral",
} as const;

/**
 * Tile compacto cuadrado para la vista grid del listado de
 * instalaciones. Misma información que InstallationCard pero en un
 * layout más denso para escanear muchas instalaciones de un vistazo.
 */
export function InstallationTile({
  data,
  onClick,
}: {
  data: OverviewInstallation;
  onClick: () => void;
}) {
  const t = thresholdFromStatus(data.status, data.avgScore);
  const accountLine = [data.accountName, data.commune].filter(Boolean).join(" · ");

  return (
    <Surface
      elevation={1}
      padding="sm"
      tappable
      hoverable
      accent={ACCENT_FROM_THRESHOLD[t]}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="text-left w-full h-full flex flex-col"
    >
      {/* Encabezado: icono + score */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "h-9 w-9 rounded-ds-md grid place-items-center shrink-0 text-base",
            ICON_TILE[t],
          )}
        >
          {data.icon || <Building2 className="h-4 w-4 text-ds-text-3" />}
        </div>
        {data.avgScore !== null ? (
          <div className="text-right">
            <p
              className={cn(
                "font-display text-lg font-bold leading-none ds-num",
                VALUE_COLOR[t],
              )}
            >
              {Math.round(data.avgScore)}
              <span className="text-xs">%</span>
            </p>
            <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mt-0.5">
              cumpl.
            </p>
          </div>
        ) : (
          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 leading-tight text-right max-w-[60%]">
            {data.hasProtocol ? "Sin evaluar" : "Sin protocolo"}
          </p>
        )}
      </div>

      {/* Nombre + cuenta */}
      <div className="mt-2 min-w-0">
        <p className="font-display font-semibold text-[13px] text-ds-text-1 leading-tight line-clamp-2">
          {data.name}
        </p>
        <p className="text-[12px] text-ds-text-3 truncate mt-0.5">
          {accountLine || "—"}
        </p>
      </div>

      {/* Barra */}
      {data.avgScore !== null && (
        <MetricBar value={data.avgScore} threshold={t} className="mt-2" />
      )}

      {/* Meta + pills siempre al fondo */}
      <div className="mt-auto pt-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[12px] text-ds-text-3">
          {data.hasProtocol && (
            <span className="flex items-center gap-1">
              <StatusDot kind="ok" />v{data.protocolVersion ?? 1}
            </span>
          )}
          <span className="truncate ds-num">
            {data.evaluatedGuards}/{data.activeGuards}
          </span>
        </div>
        {(data.failedCount > 0 || data.pendingCount > 0 || !data.hasProtocol) && (
          <div className="flex items-center gap-1 flex-wrap">
            {data.failedCount > 0 && (
              <Tag variant="danger" size="sm">⚠ {data.failedCount}</Tag>
            )}
            {data.pendingCount > 0 && (
              <Tag variant="warn" size="sm">{data.pendingCount} pend.</Tag>
            )}
            {!data.hasProtocol && (
              <Tag variant="neutral" size="sm">📋 sin protocolo</Tag>
            )}
          </div>
        )}
      </div>
    </Surface>
  );
}
