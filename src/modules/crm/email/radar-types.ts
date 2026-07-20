/** Tipos del Radar Comercial (clasificación IA de correos entrantes). */

export type RadarCategoria =
  | "cotizacion"
  | "licitacion"
  | "consulta_comercial"
  | "facturacion"
  | "operacional"
  | "otro";

export type RadarIntencion = "alta" | "media" | "baja";

/** Compromiso con fecha extraído del hilo (de cualquiera de las partes). */
export type RadarCompromiso = {
  quien: "cliente" | "nosotros";
  que: string;
  fechaISO: string; // YYYY-MM-DD
};

/** Salida JSON estricta del clasificador `gpt-4o-mini`. */
export type RadarClassification = {
  categoria: RadarCategoria;
  intencion: RadarIntencion;
  resumen: string;
  requiereRespuesta: boolean;
  senalesCompra: string[];
  compromisos: RadarCompromiso[];
};

/** Kinds de RadarItem. */
export type RadarKind = "nuevo_lead" | "senal_compra" | "compromiso" | "brief";
