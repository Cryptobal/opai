/** Tipos del Radar Comercial (clasificación IA de correos entrantes). */

export type RadarCategoria =
  | "cotizacion"
  | "licitacion"
  | "consulta_comercial"
  | "facturacion"
  | "operacional"
  | "otro";

export type RadarIntencion = "alta" | "media" | "baja";

/** Taxonomía vertical completa (A03, Radar v5). */
export type RadarVertical =
  | "operaciones"
  | "rrhh"
  | "comercial"
  | "finanzas"
  | "cobranza"
  | "contratos"
  | "incidentes"
  | "otro";

export type RadarUrgencia = "alta" | "media" | "baja";
export type RadarSentimiento = "positivo" | "neutral" | "negativo";

/**
 * Mapeo v4→v5 (compatibilidad con lo ya clasificado; la migración
 * 20261108000000 backfillea ai_vertical con esta misma regla).
 */
export function verticalFromLegacyCategoria(categoria: RadarCategoria): RadarVertical {
  if (
    categoria === "cotizacion" ||
    categoria === "licitacion" ||
    categoria === "consulta_comercial"
  ) {
    return "comercial";
  }
  if (categoria === "facturacion") return "finanzas";
  if (categoria === "operacional") return "operaciones";
  return "otro";
}

/** Compromiso con fecha extraído del hilo (de cualquiera de las partes). */
export type RadarCompromiso = {
  quien: "cliente" | "nosotros";
  que: string;
  fechaISO: string; // YYYY-MM-DD
};

/** Salida JSON estricta del clasificador `gpt-4o-mini` (v5). */
export type RadarClassification = {
  categoria: RadarCategoria;
  intencion: RadarIntencion;
  /** A03: vertical + urgencia y sentimiento separados de la intención. */
  vertical: RadarVertical;
  urgencia: RadarUrgencia;
  sentimiento: RadarSentimiento;
  resumen: string;
  requiereRespuesta: boolean;
  senalesCompra: string[];
  compromisos: RadarCompromiso[];
};

/** Kinds de RadarItem. Comercial (original) + verticales nuevas (F2). */
export type RadarKind =
  // Comercial (comportamiento original, sin cambios)
  | "nuevo_lead"
  | "senal_compra"
  | "compromiso"
  | "brief"
  // Operaciones
  | "reclamo_cliente"
  | "solicitud_operativa"
  // RRHH
  | "postulacion"
  | "solicitud_laboral"
  // Finanzas / Cobranza
  | "cobranza"
  | "disputa_factura"
  // Transversal (usa la vertical del item)
  | "sugerencia";

/** Capabilities de radar por vertical (viven en permissions.ts, módulo productividad). */
export type RadarCapability =
  | "radar_comercial"
  | "radar_operaciones"
  | "radar_rrhh"
  | "radar_finanzas";

/**
 * Vertical → capability requerida para VER sus items/badges. Fuente única para
 * UI y servidor. `otro` no exige capability (no genera badge/visibilidad).
 */
export const VERTICAL_CAPABILITY: Record<RadarVertical, RadarCapability | null> = {
  comercial: "radar_comercial",
  contratos: "radar_comercial",
  operaciones: "radar_operaciones",
  incidentes: "radar_operaciones",
  rrhh: "radar_rrhh",
  finanzas: "radar_finanzas",
  cobranza: "radar_finanzas",
  otro: null,
};

/**
 * Kind → vertical (para kinds de vertical fija). `sugerencia` es transversal:
 * usa la vertical del propio item.
 */
export const KIND_VERTICAL: Record<RadarKind, RadarVertical | null> = {
  nuevo_lead: "comercial",
  senal_compra: "comercial",
  compromiso: "comercial",
  brief: "comercial",
  reclamo_cliente: "operaciones",
  solicitud_operativa: "operaciones",
  postulacion: "rrhh",
  solicitud_laboral: "rrhh",
  cobranza: "finanzas",
  disputa_factura: "finanzas",
  sugerencia: null,
};

/** Vertical efectiva de un item (según su kind; `sugerencia` usa la del item). */
export function verticalForItem(
  kind: string,
  itemVertical: RadarVertical | null,
): RadarVertical | null {
  const fixed = KIND_VERTICAL[kind as RadarKind];
  if (fixed) return fixed;
  return itemVertical;
}

/** Capability requerida para ver un item dado su kind y (si aplica) su vertical. */
export function capabilityForItem(
  kind: string,
  itemVertical: RadarVertical | null,
): RadarCapability | null {
  const v = verticalForItem(kind, itemVertical);
  return v ? VERTICAL_CAPABILITY[v] : null;
}

/** Badge de bandeja por vertical (sólo si el solicitante tiene la capability). */
export interface RadarBadge {
  label: string;
  tone: "warn" | "danger" | "info" | "ok";
}

export function radarBadgeFor(
  vertical: RadarVertical | null,
  caps: Set<RadarCapability>,
): RadarBadge | null {
  if (!vertical) return null;
  const cap = VERTICAL_CAPABILITY[vertical];
  if (!cap || !caps.has(cap)) return null;
  switch (vertical) {
    case "comercial":
    case "contratos":
      return { label: "⭐ Lead sugerido", tone: "warn" };
    case "operaciones":
    case "incidentes":
      return { label: "⚠️ Operativo", tone: "danger" };
    case "rrhh":
      return { label: "👤 RRHH", tone: "info" };
    case "finanzas":
    case "cobranza":
      return { label: "💰 Finanzas", tone: "ok" };
    default:
      return null;
  }
}

/** Kinds no comerciales (bandeja compartida por vertical, visibilidad por capability). */
export const SHARED_RADAR_KINDS: RadarKind[] = [
  "reclamo_cliente",
  "solicitud_operativa",
  "postulacion",
  "solicitud_laboral",
  "cobranza",
  "disputa_factura",
  "sugerencia",
];

/**
 * ¿El solicitante (con estas capabilities) puede ver este item? Filtro de
 * servidor: un item sólo es visible si el usuario tiene la capability de su
 * vertical. Sin capability aplicable → no visible.
 */
export function radarItemVisible(
  kind: string,
  itemVertical: RadarVertical | null,
  caps: Set<RadarCapability>,
): boolean {
  const need = capabilityForItem(kind, itemVertical);
  return need ? caps.has(need) : false;
}
