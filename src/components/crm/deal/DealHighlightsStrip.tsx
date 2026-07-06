"use client";

import { CalendarClock, FileText, Pencil } from "lucide-react";
import { formatCLP, formatUFSuffix } from "@/lib/utils";

/**
 * DealHighlightsStrip — franja compacta de métricas clave (patrón Salesforce)
 * que vive en el bloque sticky de la ficha (vía `stickyMeta`), justo debajo del
 * pipeline. Solo presentación: recibe todo por props, sin fetch propio.
 */
interface DealHighlightsStripProps {
  amountClp: number;
  amountUf: number;
  totalGuards: number;
  serviceStartDate: string | null;
  onEditStartDate: () => void;
  /** Cotización activa (código + etiqueta de estado ya resuelta). Solo lectura aquí. */
  activeQuote?: { code: string | null; statusLabel: string } | null;
}

function formatStartDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

export function DealHighlightsStrip({
  amountClp,
  amountUf,
  totalGuards,
  serviceStartDate,
  onEditStartDate,
  activeQuote,
}: DealHighlightsStripProps) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-thin divide-x divide-border/60 px-1">
      <Item label="Monto CLP">
        <span className="text-status-ok-fg">{formatCLP(amountClp)}</span>
      </Item>
      <Item label="Monto UF">
        <span className="text-status-info-fg">{formatUFSuffix(amountUf)}</span>
      </Item>
      <Item label="Guardias">
        <span className="text-status-warn-fg">{totalGuards.toLocaleString("es-CL")}</span>
      </Item>
      <Item label="Inicio">
        {serviceStartDate ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            {formatStartDate(serviceStartDate)}
            <button
              type="button"
              onClick={onEditStartDate}
              title="Editar fecha de inicio"
              className="text-ds-text-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={onEditStartDate}
            className="inline-flex items-center gap-1.5 text-[13px] font-normal text-ds-text-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            Definir
          </button>
        )}
      </Item>
      <Item label="Cotización activa">
        {activeQuote?.code ? (
          <span className="inline-flex items-center gap-1.5 truncate">
            <FileText className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            <span className="truncate">{activeQuote.code}</span>
            <span className="text-[11px] font-medium text-ds-text-3">· {activeQuote.statusLabel}</span>
          </span>
        ) : (
          <span className="text-[13px] font-normal text-ds-text-3">Sin cotización</span>
        )}
      </Item>
      {/* Propietario: sin fuente de datos en los props actuales de la ficha —
          se omite para no fabricar. Se añadirá cuando el server component exponga owner. */}
    </div>
  );
}
