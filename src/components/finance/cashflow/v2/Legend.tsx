import { Lock, ArrowLeftRight, FileText, EyeOff } from "lucide-react";
import { CellStatusPill } from "@/components/finance/cashflow/CellStatusPill";
import { GestionGlyphs } from "./grid/GestionGlyphs";
import type { CellGestionSummary } from "@/modules/finance/cashflow/types";

/** Fixture de gestión para la leyenda (reusa GestionGlyphs, sin SVG duplicado). */
function gFixture(overrides: Partial<CellGestionSummary>): CellGestionSummary {
  return {
    proformaRequired: false,
    proformaStatus: "NONE",
    proformaSentAt: null,
    proformaLastRecipient: null,
    epRequired: false,
    epStatus: "NONE",
    epSentAt: null,
    ocFolio: null,
    ...overrides,
  };
}

const GESTION_LEGEND: { label: string; gestion: CellGestionSummary }[] = [
  { label: "proforma enviada", gestion: gFixture({ proformaRequired: true, proformaStatus: "SENT" }) },
  { label: "aprobada por cliente", gestion: gFixture({ proformaRequired: true, proformaStatus: "APPROVED" }) },
  { label: "estado de pago enviado", gestion: gFixture({ epRequired: true, epStatus: "SENT" }) },
  { label: "OC recibida", gestion: gFixture({ ocFolio: "4500-8812" }) },
];

/** Mini-leyenda reducida de las affordances esenciales del detalle. */
export function Legend() {
  return (
    <div className="flex flex-col gap-2 text-[12px] text-ds-text-3">
      {/* Ciclo de vida de una factura, en orden */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="mr-1 font-medium">Etapa:</span>
        <CellStatusPill variant="PROJECTED" />
        <span aria-hidden>→</span>
        <CellStatusPill variant="DRAFT" />
        <span aria-hidden>→</span>
        <CellStatusPill variant="INVOICED" />
        <span aria-hidden>→</span>
        <CellStatusPill variant="FACTORING" />
        <span className="ml-1 text-ds-text-4">· y al cobrarse</span>
        <CellStatusPill variant="PAID" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> candado = conciliado (fijo)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5" /> arrastrar / click derecho = mover
        </span>
        <span className="inline-flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5" /> ocultar del flujo
        </span>
        <span className="inline-flex items-center gap-1.5">
          click en celda vacía = agregar cuota
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-ds-sm bg-ds-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
            UF
          </span>{" "}
          monto en UF
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary" /> N° = folio de factura
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-ds-sm bg-tint-violet-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-violet-fg">
            + EXTRA
          </span>{" "}
          = 2ª+ factura de la misma semana
        </span>
      </div>
      {/* Gestión de cobro: micro-glifos del chip (proforma/EP/OC) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="mr-1 font-medium">Gestión:</span>
        {GESTION_LEGEND.map(({ label, gestion }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <GestionGlyphs gestion={gestion} size="sm" /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}
