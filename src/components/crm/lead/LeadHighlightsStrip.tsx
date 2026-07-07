"use client";

import { formatCLP, formatUFSuffix } from "@/lib/utils";

/**
 * LeadHighlightsStrip — franja compacta de métricas del lead (espejo de
 * DealHighlightsStrip). Solo presentación: recibe todo por props.
 */
export interface LeadHighlightsStripProps {
  source: string | null;
  installationCount: number;
  positionCount: number;
  totalGuards: number;
  estimatedSaleClp: number | null;
  estimatedSaleUf: number | null;
  firstContactChannel?: string | null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col justify-center px-3.5 first:pl-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ds-text-3">
        {label}
      </span>
      <span className="mt-0.5 truncate text-[15px] font-semibold leading-tight tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function LeadHighlightsStrip({
  source,
  installationCount,
  positionCount,
  totalGuards,
  estimatedSaleClp,
  estimatedSaleUf,
}: LeadHighlightsStripProps) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-thin divide-x divide-border/60 px-1">
      <Item label="Fuente">
        <span className="text-foreground">{source || "—"}</span>
      </Item>
      <Item label="Instalaciones">
        <span className="text-status-info-fg">{installationCount.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Puestos">
        <span className="text-foreground">{positionCount.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Guardias">
        <span className="text-status-warn-fg">{totalGuards.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Venta est. CLP">
        <span className="text-status-ok-fg">
          {estimatedSaleClp != null ? formatCLP(estimatedSaleClp) : "—"}
        </span>
      </Item>
      <Item label="Venta est. UF">
        <span className="text-status-info-fg">
          {estimatedSaleUf != null ? formatUFSuffix(estimatedSaleUf) : "—"}
        </span>
      </Item>
    </div>
  );
}
