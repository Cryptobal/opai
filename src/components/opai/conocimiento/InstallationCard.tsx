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

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function thresholdFromStatus(status: OverviewInstallation["status"], score: number | null): Threshold {
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
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left card-mock p-4 tap-mock relative overflow-hidden"
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", thresholdBorderLeft(t))} />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg grid place-items-center shrink-0 text-base",
            ICON_TILE_STYLE[t],
          )}
        >
          {data.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display font-semibold text-[14px] truncate">
                {data.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">
                {accountLine || "—"}
              </div>
            </div>
            {data.avgScore !== null ? (
              <div className="text-right shrink-0">
                <div
                  className={cn(
                    "font-display text-xl font-bold num-tabular leading-none",
                    thresholdText(t),
                  )}
                >
                  {Math.round(data.avgScore)}
                  <span className="text-sm">%</span>
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">cumpl.</div>
              </div>
            ) : (
              <div className="text-right shrink-0">
                <div className="font-display text-xs text-white/40 leading-none mt-1">
                  {data.hasProtocol ? "Sin evaluar" : "Sin protocolo"}
                </div>
              </div>
            )}
          </div>

          {data.avgScore !== null && (
            <Bar value={data.avgScore} threshold={t} className="mt-2.5" />
          )}

          <div className="flex items-center gap-3 mt-2.5 text-[10px] text-white/50 font-mono flex-wrap">
            {data.hasProtocol && (
              <span className="flex items-center gap-1">
                <StatusDot threshold="ok" />
                Protocolo v{data.protocolVersion ?? 1}
              </span>
            )}
            <span>
              {data.evaluatedGuards}/{data.activeGuards} evaluados
            </span>
            {data.lastExamAt && <span>hace {daysAgo(data.lastExamAt)}d</span>}
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {data.failedCount > 0 && (
              <Pill variant="danger">⚠ {data.failedCount} reprobados</Pill>
            )}
            {data.pendingCount > 0 && (
              <Pill variant="warn">{data.pendingCount} pendientes</Pill>
            )}
            {!data.hasProtocol && (
              <>
                <Pill variant="neutral">📋 Crear protocolo</Pill>
                <Pill variant="brand">✨ con IA</Pill>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
