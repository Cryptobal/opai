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

/** Kinds de RadarItem. */
export type RadarKind = "nuevo_lead" | "senal_compra" | "compromiso" | "brief";
