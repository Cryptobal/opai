"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCLP, formatUFSuffix, cn } from "@/lib/utils";
import { ageBucket, daysInStage, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import type { CrmDeal, CrmPipelineStage } from "@/types";
import { getDealCommercialIndicators, shortStageName } from "./deals-helpers";

type Props = {
  deal: CrmDeal | null;
  stages: CrmPipelineStage[];
  onClose: () => void;
  onMoveStage: (dealId: string, stageId: string) => void;
};

export function DealDetailPanel({ deal, stages, onClose, onMoveStage }: Props) {
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deal, onClose]);

  if (!deal) return null;

  const indicators = getDealCommercialIndicators(deal);
  const { days, source } = daysInStage(deal);
  const bucket = ageBucket(days);
  const openStages = stages.filter((s) => !s.isClosedWon && !s.isClosedLost);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar panel"
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute z-50 flex flex-col bg-ds-surface-1 shadow-xl",
          "inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl",
          "sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-l sm:border-ds-border-subtle",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal
        aria-label={deal.title}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-surface-3 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-2 border-b border-ds-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold text-ds-text-1">
              {deal.title}
            </h2>
            <p className="truncate text-[13px] text-ds-text-3">{deal.account?.name}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Monto"
              value={
                indicators.amountClp > 0
                  ? formatCLP(indicators.amountClp)
                  : "Sin cotización"
              }
              warn={indicators.amountClp === 0}
            />
            <Metric label="UF" value={formatUFSuffix(indicators.amountUf)} />
            <Metric label="Puestos" value={String(indicators.totalGuards)} />
            <Metric
              label="Días en etapa"
              value={`${days}d`}
              hint={source === "created_at" ? "desde creación" : undefined}
              tone={bucket}
            />
          </div>

          <div>
            <p className="mb-2 text-[12px] uppercase tracking-wide text-ds-text-3">
              Avance de pipeline
            </p>
            <div className="flex flex-wrap gap-1">
              {openStages.map((s) => {
                const active = s.id === deal.stageId;
                const color = sanitizeStageColor(s.color) ?? "hsl(var(--ds-text-4))";
                return (
                  <span
                    key={s.id}
                    className={cn(
                      "rounded-full px-2 py-1 text-[12px]",
                      active ? "bg-ds-surface-3 font-medium text-ds-text-1" : "text-ds-text-4",
                    )}
                    style={active ? { boxShadow: `inset 0 -2px 0 ${color}` } : undefined}
                  >
                    {shortStageName(s.name)}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] uppercase tracking-wide text-ds-text-3">
              Mover a etapa
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const color = sanitizeStageColor(s.color);
                const active = s.id === deal.stageId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={active}
                    onClick={() => onMoveStage(deal.id, s.id)}
                    className={cn(
                      "deals-touch rounded-full border px-2.5 text-[12px]",
                      active
                        ? "border-ds-border-default bg-ds-surface-3 text-ds-text-1"
                        : "border-ds-border-subtle text-ds-text-2 hover:bg-ds-surface-2",
                    )}
                  >
                    {color ? (
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ) : null}
                    {shortStageName(s.name)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-ds-border-subtle px-4 py-3">
          <Button variant="outline" className="h-10 flex-1 sm:h-9" asChild>
            <Link href={`/crm/deals/${deal.id}#actividad`} onClick={onClose}>
              Registrar actividad
            </Link>
          </Button>
          <Button className="h-10 flex-1 sm:h-9" asChild>
            <Link href={`/crm/deals/${deal.id}`} onClick={onClose}>
              Abrir negocio
            </Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  warn,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="rounded-md bg-ds-surface-2 px-3 py-2">
      <p className="text-[12px] text-ds-text-3">{label}</p>
      <p
        className={cn(
          "ds-num text-[13px] font-semibold",
          warn
            ? "text-status-warn-fg"
            : tone === "ok"
              ? "text-status-ok-fg"
              : tone === "warn"
                ? "text-status-warn-fg"
                : tone === "danger"
                  ? "text-status-danger-fg"
                  : "text-ds-text-1",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[12px] text-ds-text-4">{hint}</p> : null}
    </div>
  );
}
