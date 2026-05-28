/** Formato CLP canónico de la pantalla (igual que la page server). */
export const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/**
 * La proyección viaja serializada a JSON (server → client), así que las
 * fechas llegan como ISO string aunque el tipo diga Date. Normaliza a Date
 * de forma segura sea cual sea el runtime real.
 */
export function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}
