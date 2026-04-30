"use client";

import { TrendingDown, TrendingUp, Minus, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Surface,
  Tag,
  EmptyState,
  thresholdFromScore,
  type Threshold,
} from "@/components/opai-ds";
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

const STATUS_VARIANT: Record<GuardStatus, "ok" | "warn" | "danger" | "neutral"> = {
  approved: "ok",
  borderline: "warn",
  failed: "danger",
  pending: "warn",
  unevaluated: "neutral",
};

const VALUE_COLOR: Record<Threshold, string> = {
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  neutral: "text-ds-text-3",
};

const AVATAR_VARIANT_FROM_THRESHOLD = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  neutral: "neutral",
} as const;

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
      <Surface elevation={1} padding="none" className="mb-5">
        <EmptyState
          compact
          icon={UserX}
          title="Aún no hay guardias asignados"
          description="Asigna guardias a esta instalación desde el módulo de Personas."
        />
      </Surface>
    );
  }

  return (
    <div className="mb-5">
      <h3 className="font-display text-[14px] font-semibold mb-2 text-ds-text-1">
        {title}
      </h3>
      <ul className="space-y-2 ds-list-cascade">
        {guards.map((g) => {
          const t = thresholdFromGuard(g);
          return (
            <li key={g.guardId}>
              <Surface elevation={1} padding="sm">
                <div className="flex items-center gap-3">
                  <Avatar
                    initials={g.initials}
                    variant={AVATAR_VARIANT_FROM_THRESHOLD[t]}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[14px] font-semibold text-ds-text-1 truncate">
                        {g.name}
                      </span>
                      {g.trend === "up" && (
                        <TrendingUp className="h-3 w-3 text-status-ok-fg shrink-0" />
                      )}
                      {g.trend === "down" && (
                        <TrendingDown className="h-3 w-3 text-status-danger-fg shrink-0" />
                      )}
                      {g.trend === "stable" && (
                        <Minus className="h-3 w-3 text-ds-text-4 shrink-0" />
                      )}
                    </div>
                    <p className="text-[12px] text-ds-text-3 mt-0.5">
                      {[g.shift, daysAgo(g.lastExamAt)].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {g.avgScore !== null ? (
                      <p
                        className={cn(
                          "font-display font-bold ds-num text-base leading-none",
                          VALUE_COLOR[thresholdFromScore(g.avgScore)],
                        )}
                      >
                        {Math.round(g.avgScore)}
                        <span className="text-xs">%</span>
                      </p>
                    ) : (
                      <p className="text-[12px] font-mono text-ds-text-4">—</p>
                    )}
                    <div className="mt-1">
                      <Tag variant={STATUS_VARIANT[g.status]} size="sm">
                        {STATUS_LABEL[g.status]}
                      </Tag>
                    </div>
                  </div>
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
