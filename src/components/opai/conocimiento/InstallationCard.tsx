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

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

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

export function InstallationCard({
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
      padding="md"
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
      className="text-left w-full"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-ds-md grid place-items-center shrink-0 text-base",
            ICON_TILE[t],
          )}
        >
          {data.icon || <Building2 className="h-4 w-4 text-ds-text-3" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display font-semibold text-[14px] text-ds-text-1 truncate">
                {data.name}
              </p>
              <p className="text-[12px] text-ds-text-3 truncate">
                {accountLine || "—"}
              </p>
            </div>
            {data.avgScore !== null ? (
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "font-display text-xl font-bold leading-none ds-num",
                    VALUE_COLOR[t],
                  )}
                >
                  {Math.round(data.avgScore)}
                  <span className="text-sm">%</span>
                </p>
                <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mt-0.5">
                  cumpl.
                </p>
              </div>
            ) : (
              <div className="text-right shrink-0">
                <p className="font-display text-xs text-ds-text-3 leading-none mt-1">
                  {data.hasProtocol ? "Sin evaluar" : "Sin protocolo"}
                </p>
              </div>
            )}
          </div>

          {data.avgScore !== null && (
            <MetricBar value={data.avgScore} threshold={t} className="mt-2.5" />
          )}

          <div className="flex items-center gap-3 mt-2.5 text-[12px] text-ds-text-3 flex-wrap">
            {data.hasProtocol && (
              <span className="flex items-center gap-1.5">
                <StatusDot kind="ok" />
                Protocolo v{data.protocolVersion ?? 1}
              </span>
            )}
            <span>
              {data.evaluatedGuards}/{data.activeGuards} evaluados
            </span>
            {data.lastExamAt && (
              <span>hace {daysAgo(data.lastExamAt)}d</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {data.failedCount > 0 && (
              <Tag variant="danger" size="sm">⚠ {data.failedCount} reprobados</Tag>
            )}
            {data.pendingCount > 0 && (
              <Tag variant="warn" size="sm">{data.pendingCount} pendientes</Tag>
            )}
            {!data.hasProtocol && (
              <>
                <Tag variant="neutral" size="sm">📋 Crear protocolo</Tag>
                <Tag variant="brand" size="sm">✨ con IA</Tag>
              </>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}
