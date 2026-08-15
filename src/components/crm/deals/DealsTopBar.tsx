"use client";

import { Search, Plus } from "lucide-react";
import { WorkbenchKpiStrip } from "@/components/workbench";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClpCompact } from "@/lib/crm/deal-metrics";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";

type Props = {
  summary: DealsPipelineSummary;
  search: string;
  onSearchChange: (v: string) => void;
  focusLabel?: string | null;
  onNewDeal: () => void;
};

export function DealsTopBar({
  summary,
  search,
  onSearchChange,
  focusLabel,
  onNewDeal,
}: Props) {
  const { open } = summary;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold text-ds-text-1 sm:text-2xl">
            Negocios
          </h1>
          {focusLabel ? (
            <p className="mt-0.5 text-[13px] text-ds-text-3">{focusLabel}</p>
          ) : null}
          {/* Mobile compact KPI line */}
          <p className="mt-1 text-[13px] text-ds-text-2 tabular-nums sm:hidden">
            {formatClpCompact(open.clp)} · abierto · {open.count} negocio
            {open.count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-3" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar título, cuenta o contacto…"
              className={cn(
                "h-10 rounded-full border-[var(--glass-border)] bg-[var(--glass-fill-soft)] pl-9 text-ds-text-1",
                "placeholder:text-ds-text-4 focus-visible:ring-[rgba(var(--ds-glow-rgb),0.4)] sm:h-9",
              )}
              aria-label="Buscar negocios"
            />
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="deals-touch h-10 w-10 shrink-0 sm:h-9 sm:w-9"
            onClick={onNewDeal}
            aria-label="Nuevo negocio"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="hidden sm:block">
        <WorkbenchKpiStrip
          items={[
            {
              id: "open-clp",
              label: "Pipeline abierto",
              value: formatClpCompact(open.clp),
              tone: "brand",
            },
            { id: "count", label: "Negocios", value: open.count, tone: "brand" },
            {
              id: "weighted",
              label: "Ponderado",
              value: formatClpCompact(open.weightedClp),
              tone: "info",
            },
            {
              id: "guards",
              label: "Puestos en juego",
              value: open.guards.toLocaleString("es-CL"),
              tone: "ok",
            },
          ]}
        />
      </div>
    </div>
  );
}
