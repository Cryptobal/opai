/**
 * Tokens compartidos para los asuntos de email del módulo Finanzas
 * (Proforma, Estado de Pago, Factura/NC/ND).
 *
 * Centraliza:
 *  - El cálculo de los valores (cliente, instalación, mes) que no son
 *    triviales y se usan en más de un servicio.
 *  - El postprocess que limpia separadores feos cuando algún token
 *    resuelve a "" (típico: instalación vacía → "X -  - Mayo" sin esto).
 *
 * Los servicios siguen siendo responsables de combinar estos tokens con
 * los específicos suyos (folio, total, fecha, etc.) — este módulo solo
 * provee los building blocks.
 */

const MES_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

/**
 * Formatea una fecha como "Mayo 2026" (mes capitalizado + año).
 * Ojo: Intl.DateTimeFormat con locale es-CL produce "mayo de 2026";
 * sacamos el " de " y capitalizamos.
 */
export function formatMonthYearEs(date: Date): string {
  const raw = MES_FORMATTER.format(date); // "mayo de 2026"
  const cleaned = raw.replace(/\s+de\s+/i, " "); // "mayo 2026"
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Postprocesa un subject ya renderizado:
 *   - Colapsa secuencias de separadores que quedaron por tokens vacíos
 *     (ej: "Proforma -  - Mayo 2026" → "Proforma - Mayo 2026").
 *   - Trimea bordes y guiones colgantes.
 *
 * No toca contenido legítimo: solo opera sobre " - " duplicados o pegados
 * a los bordes.
 */
export function sanitizeSubject(subject: string): string {
  return subject
    .replace(/\s*-\s*-\s*/g, " - ") // " -  - " → " - "
    .replace(/\s*-\s*-\s*/g, " - ") // segunda pasada por triples
    .replace(/^\s*-\s*/, "") // "- foo" → "foo"
    .replace(/\s*-\s*$/, "") // "foo -" → "foo"
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Tokens "comunes" que comparten los 3 tipos de email (Proforma, EP, DTE).
 * Los servicios pueden mergear su mapa específico encima.
 */
export interface CommonSubjectTokens {
  /** Razón social / nombre del receptor — el cliente. */
  cliente: string;
  /** Alias de `cliente` para compat con templates viejos. */
  razonSocial: string;
  /** Nombre de la instalación si está vinculada, "" si no. */
  instalacion: string;
  /** Mes + año formateados ("Mayo 2026"). */
  mes: string;
  /** Fecha YYYY-MM-DD. */
  fecha: string;
}

export function buildCommonSubjectTokens(input: {
  receiverName: string;
  installationName: string | null;
  date: Date;
}): CommonSubjectTokens {
  const cliente = input.receiverName ?? "";
  return {
    cliente,
    razonSocial: cliente,
    instalacion: input.installationName?.trim() ?? "",
    mes: formatMonthYearEs(input.date),
    fecha: input.date.toISOString().split("T")[0],
  };
}

/**
 * Lista de placeholders soportados en cada tipo de email. Usado por la UI
 * para renderizar chips clickeables y por la doc.
 */
export const COMMON_TOKENS = [
  "cliente",
  "instalacion",
  "mes",
  "fecha",
] as const;

/**
 * Tokens específicos de Proforma / Estado de Pago.
 */
export const BILLING_DOC_TOKENS = [
  ...COMMON_TOKENS,
  "folio",
  "tipo",
  "total",
  "periodo",
  "numeroOrdenContrato",
  "receiverName",
  "razonSocial",
] as const;

/**
 * Tokens específicos de Factura/NC/ND.
 */
export const DTE_EMITIDO_TOKENS = [
  ...COMMON_TOKENS,
  "folio",
  "tipo",
  "total",
  "receiverName",
  "razonSocial",
] as const;
