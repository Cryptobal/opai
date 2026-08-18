"use client";

import { formatUFSuffix } from "@/lib/utils";

/**
 * LeadHighlightsStrip — franja compacta de métricas del lead (espejo de
 * DealHighlightsStrip). Solo presentación: recibe todo por props.
 *
 * Móvil/desktop: Instalaciones · Puestos · Venta est. UF
 * (fuente, guardias y venta CLP viven en PulseBar / stepper).
 */
export interface LeadHighlightsStripProps {
  installationCount: number;
  positionCount: number;
  estimatedSaleUf: number | null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col justify-center px-3.5 first:pl-1">
      <span className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ds-text-3">
        {label}
      </span>
      <span className="mt-0.5 truncate text-[15px] font-semibold leading-tight tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function LeadHighlightsStrip({
  installationCount,
  positionCount,
  estimatedSaleUf,
}: LeadHighlightsStripProps) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-thin divide-x divide-border/60 px-1">
      <Item label="Instalaciones">
        <span className="text-status-info-fg">{installationCount.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Puestos">
        <span className="text-foreground">{positionCount.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Venta est. UF">
        <span className="text-status-info-fg">
          {estimatedSaleUf != null ? formatUFSuffix(estimatedSaleUf) : "—"}
        </span>
      </Item>
    </div>
  );
}
