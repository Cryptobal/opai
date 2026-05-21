"use client";

import * as React from "react";
import { HelpCircle, AlertCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type LegendItem = {
  symbol: React.ReactNode;
  label: string;
  description: string;
};

const STATUS_ITEMS: LegendItem[] = [
  {
    symbol: (
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-info-fg" />
    ),
    label: "Azul",
    description:
      "Factura emitida (INVOICED). Aceptada en SII pero aún sin pagar.",
  },
  {
    symbol: (
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-ok-fg" />
    ),
    label: "Verde",
    description:
      "Factura pagada (PAID). Conciliada con un movimiento bancario.",
  },
  {
    symbol: (
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500 dark:bg-purple-400" />
    ),
    label: "Morado",
    description:
      "Factura cedida al factor (CEDED). Pago acelerado por factoring.",
  },
  {
    symbol: (
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-warn-fg" />
    ),
    label: "Amarillo",
    description:
      "Borrador (DRAFT). Aún no enviado al SII, sin folio asignado.",
  },
  {
    symbol: <AlertCircle className="h-3.5 w-3.5 text-status-warn-fg" />,
    label: "Triángulo amarillo",
    description: "Factura vencida sin pagar. Junto al dot azul, indica mora.",
  },
];

const STYLE_ITEMS: LegendItem[] = [
  {
    symbol: <span className="font-mono text-[12px]">4.917.533</span>,
    label: "Monto normal",
    description: "Cuota proyectada del contrato (cálculo teórico mensual).",
  },
  {
    symbol: (
      <span className="font-mono text-[12px] italic text-ds-text-2">
        4.917.533
      </span>
    ),
    label: "Monto en cursiva",
    description:
      "Factura real emitida en una semana sin proyección. Monto bruto del DTE.",
  },
  {
    symbol: (
      <div className="leading-tight">
        <div className="font-mono text-[11px] line-through opacity-50">
          5.000.000
        </div>
        <div className="font-mono text-[11px] font-semibold">4.917.533</div>
        <div className="font-mono text-[11px] text-status-warn-fg">-82.467</div>
      </div>
    ),
    label: "Monto con varianza",
    description:
      "Proyectado (tachado) vs real (banco) y la diferencia. Verde si conviene, amarillo si no.",
  },
  {
    symbol: (
      <span className="text-[10px] font-bold text-purple-400 dark:text-purple-300">
        F
      </span>
    ),
    label: "Letra F",
    description:
      "Contrato con modo de cobro FACTORING. El cobro entra acelerado (días configurados).",
  },
];

const CONTRACT_BADGE_ITEMS: LegendItem[] = [
  {
    symbol: (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-status-ok-soft text-status-ok-fg">
        1 CONTRATO
      </span>
    ),
    label: "Badge CONTRATO",
    description:
      "Cliente con contrato activo. Las cuotas se proyectan automáticamente.",
  },
  {
    symbol: (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-ds-surface-3 text-ds-text-2">
        CONTRATO
      </span>
    ),
    label: "Badge gris CONTRATO",
    description:
      "Fila de detalle del contrato. Versión sin contar, dentro del grupo del cliente.",
  },
  {
    symbol: (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-status-info-soft text-status-info-fg">
        UF
      </span>
    ),
    label: "Badge UF",
    description:
      "Contrato en UF. El monto en pesos varía mensualmente según el tipo de cambio.",
  },
];

function LegendSection({
  title,
  items,
}: {
  title: string;
  items: LegendItem[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
        {title}
      </h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex h-9 w-16 shrink-0 items-center justify-center rounded bg-ds-surface-2">
              {item.symbol}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ds-text-1">
                {item.label}
              </div>
              <div className="text-[12px] text-ds-text-3 leading-relaxed">
                {item.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashflowLegend({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-md border border-ds-border-default h-9 sm:h-8 w-9 sm:w-8 text-ds-text-3 hover:text-ds-text-1 hover:bg-ds-surface-2 transition-colors",
            className,
          )}
          aria-label="Leyenda de íconos"
          title="Leyenda de íconos"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      {/* IMPORTANTE: el PopoverContent shadcn (src/components/ui/popover.tsx)
          tiene hardcoded `max-w-[var(--radix-popover-trigger-width)]`, lo cual
          fuerza el contenido al ancho del trigger (~80px del botón "Leyenda").
          Por eso usamos style inline para override el max-width — Tailwind no
          puede ganarle desde className. */}
      <PopoverContent
        align="end"
        sideOffset={6}
        className="max-h-[80vh] overflow-y-auto p-4 space-y-4"
        style={{ width: 420, maxWidth: "min(420px, calc(100vw - 24px))" }}
      >
        <div>
          <h2 className="text-sm font-semibold text-ds-text-1 mb-1">
            Guía de íconos del flujo
          </h2>
          <p className="text-[12px] text-ds-text-3 leading-relaxed">
            Cada celda puede tener varios indicadores. Esta es la guía de qué
            significa cada uno.
          </p>
        </div>

        <LegendSection
          title="Estados de factura (dot de color)"
          items={STATUS_ITEMS}
        />
        <LegendSection title="Estilos de monto" items={STYLE_ITEMS} />
        <LegendSection title="Badges de fila" items={CONTRACT_BADGE_ITEMS} />

        <div className="border-t border-ds-border-default pt-3 text-[12px] text-ds-text-3 leading-relaxed">
          <strong className="text-ds-text-2">Tip:</strong> hacé hover sobre
          cualquier celda para ver el tooltip con el detalle de la factura
          (folio, estado, días de mora).
        </div>
      </PopoverContent>
    </Popover>
  );
}
