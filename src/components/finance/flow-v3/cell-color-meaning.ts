/**
 * Significado de marcas de esquina / chips — fuente única para leyenda
 * global y tip contextual en la ficha de celda.
 */
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { cornerKind, secondaryMarks } from "./cell-meta";

export interface ColorMeaningItem {
  key: string;
  swatch: string;
  title: string;
  desc: string;
}

const SW = {
  real:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-ok after:content-['']",
  dte:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-info after:content-['']",
  ceded:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-info after:content-[''] before:absolute before:right-0 before:bottom-0 before:h-0 before:w-0 before:border-l-[5px] before:border-b-[5px] before:border-l-transparent before:border-b-status-ok before:content-['']",
  cededReal:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-ok after:content-[''] before:absolute before:right-0 before:bottom-0 before:h-0 before:w-0 before:border-l-[5px] before:border-b-[5px] before:border-l-transparent before:border-b-status-ok before:content-['']",
  draft:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-warn after:content-['']",
  ep:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-warn after:content-[''] before:absolute before:right-0 before:bottom-0 before:h-0 before:w-0 before:border-l-[5px] before:border-b-[5px] before:border-l-transparent before:border-b-primary before:content-['']",
  proforma:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-warn after:content-[''] before:absolute before:right-0 before:bottom-0 before:h-0 before:w-0 before:border-l-[5px] before:border-b-[5px] before:border-l-transparent before:border-b-status-info before:content-['']",
  scheduled: "bg-ds-surface-1 border border-ds-border-default",
  plan:
    "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-primary after:content-['']",
  note:
    "relative bg-ds-surface-1 border border-ds-border-default before:absolute before:bottom-0.5 before:left-0.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-status-info before:content-['']",
} as const;

/** Ítems de la leyenda global (modo marcas de esquina). */
export const CORNER_LEGEND_ITEMS: ColorMeaningItem[] = [
  {
    key: "real",
    swatch: SW.real,
    title: "Real (conciliado)",
    desc: "Marca de esquina verde — la plata ya entró o salió.",
  },
  {
    key: "dte",
    swatch: SW.dte,
    title: "Factura emitida",
    desc: "Marca azul arriba — DTE con folio (ej. F°1234). Folio en el tooltip.",
  },
  {
    key: "ceded",
    swatch: SW.ceded,
    title: "Factura cedida",
    desc: "Azul arriba + verde abajo — emitida y cedida a factoring (total o parcial). Chip «cedida N%»; si el anticipo ya está en banco, «anticipo en banco». No genera mora ni cobranza al cliente.",
  },
  {
    key: "draft",
    swatch: SW.draft,
    title: "Borrador",
    desc: "Marca ámbar arriba — borrador sin enviar (o con docs de cobro; ver abajo).",
  },
  {
    key: "ep",
    swatch: SW.ep,
    title: "EP enviado",
    desc: "Ámbar arriba + teal abajo — borrador con estado de pago enviado.",
  },
  {
    key: "proforma",
    swatch: SW.proforma,
    title: "Proforma enviada",
    desc: "Ámbar arriba + azul abajo — borrador con proforma enviada. Si tiene EP y proforma, aparecen ambos abajo.",
  },
  {
    key: "scheduled",
    swatch: SW.scheduled,
    title: "Programada",
    desc: "Sin marca — cuota proyectada; monto en tono atenuado.",
  },
  {
    key: "plan",
    swatch: SW.plan,
    title: "Plan manual",
    desc: "Marca teal — monto editado a mano; pisa la proyección (salvo factura emitida).",
  },
  {
    key: "note",
    swatch: SW.note,
    title: "Nota",
    desc: "Punto azul abajo a la izquierda — hay una nota en la celda (clic → Nota).",
  },
];

const BY_KEY = Object.fromEntries(
  CORNER_LEGEND_ITEMS.map((it) => [it.key, it]),
) as Record<string, ColorMeaningItem>;

/**
 * Significado de las marcas de ESTA celda (para la ficha de detalle).
 * null si no hay marcas ni estado visual relevante.
 */
export function resolveCellColorMeaning(
  cell: FlowMatrixCellDto,
): ColorMeaningItem | null {
  const corner = cornerKind(cell);
  const marks = secondaryMarks(cell);
  const ceded = marks.includes("ceded");

  if (corner === "real") {
    if (ceded) {
      return {
        key: "ceded-real",
        swatch: SW.cededReal,
        title: "Factura cedida (conciliada)",
        desc: "Verde arriba + verde abajo — ya conciliada y cedida a factoring.",
      };
    }
    return BY_KEY.real;
  }

  if (corner === "dte") {
    return ceded ? BY_KEY.ceded : BY_KEY.dte;
  }

  if (corner === "warn") {
    const ep = marks.includes("estadoPago");
    const pf = marks.includes("proforma");
    if (ep && pf) {
      return {
        key: "ep-proforma",
        swatch: SW.ep,
        title: "EP + Proforma enviados",
        desc: "Ámbar arriba — borrador con estado de pago y proforma enviados (marcas abajo).",
      };
    }
    if (ep) return BY_KEY.ep;
    if (pf) return BY_KEY.proforma;
    return BY_KEY.draft;
  }

  if (corner === "plan") return BY_KEY.plan;

  if (corner === null && cell.layer === "committed") return BY_KEY.scheduled;

  if (cell.note?.trim()) return BY_KEY.note;

  return null;
}
