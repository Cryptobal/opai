"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GuardAvatar,
  Pill,
  thresholdFromScore,
  thresholdText,
  type Threshold,
} from "./_primitives";
import type {
  GuardStatus,
  InstallationDetailGuard,
} from "@/lib/protocols/knowledge-aggregator-types";

function thresholdFromGuard(g: InstallationDetailGuard): Threshold {
  if (g.status === "approved") return "ok";
  if (g.status === "borderline") return "warn";
  if (g.status === "failed") return "danger";
  return "neutral";
}

const STATUS_LABEL: Record<GuardStatus, string> = {
  approved: "Aprobado",
  borderline: "Cumple mínimo",
  failed: "Bajo mínimo",
  pending: "Pendiente",
  unevaluated: "Sin evaluar",
};

const STATUS_VARIANT: Record<
  GuardStatus,
  "ok" | "warn" | "danger" | "neutral"
> = {
  approved: "ok",
  borderline: "warn",
  failed: "danger",
  pending: "warn",
  unevaluated: "neutral",
};

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  return `hace ${days}d`;
}

export function GuardsList({
  guards,
  title = "Guardias",
}: {
  guards: InstallationDetailGuard[];
  title?: string;
}) {
  if (!guards.length) {
    return (
      <div className="card-mock-tight p-6 text-center text-[12px] text-white/40 mb-5">
        Aún no hay guardias asignados a esta instalación.
      </div>
    );
  }

  return (
    <div className="mb-5">
      <h3 className="font-display text-[13px] font-semibold mb-2 text-white">
        {title}
      </h3>
      <div className="space-y-2">
        {guards.map((g) => {
          const t = thresholdFromGuard(g);
          return (
            <div
              key={g.guardId}
              className="card-mock-tight p-3 flex items-center gap-3"
            >
              <GuardAvatar
                initials={g.initials}
                threshold={t === "neutral" ? "neutral" : t}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[13px] font-semibold truncate">
                    {g.name}
                  </span>
                  {g.trend === "up" && (
                    <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                  )}
                  {g.trend === "down" && (
                    <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />
                  )}
                  {g.trend === "stable" && (
                    <Minus className="h-3 w-3 text-white/30 shrink-0" />
                  )}
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  {[g.shift, daysAgo(g.lastExamAt)].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="text-right shrink-0">
                {g.avgScore !== null ? (
                  <div
                    className={cn(
                      "font-display font-bold num-tabular text-base leading-none",
                      thresholdText(thresholdFromScore(g.avgScore)),
                    )}
                  >
                    {Math.round(g.avgScore)}
                    <span className="text-xs">%</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-white/30 font-mono">—</div>
                )}
                <div className="mt-1">
                  <Pill variant={STATUS_VARIANT[g.status]}>
                    {STATUS_LABEL[g.status]}
                  </Pill>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
