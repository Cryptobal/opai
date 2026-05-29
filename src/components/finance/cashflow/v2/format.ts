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

/** Formato compacto del rango de un bucket semanal: "26 may – 1 jun".
 *  Acepta string | Date porque los buckets viajan serializados (ISO) desde el
 *  server, aunque el tipo declare Date. Si el rango cae en el mismo mes,
 *  abrevia el inicio ("26 – 1 jun"); si cruza meses, lo muestra completo. */
export function fmtBucketRange(start: string | Date, end: string | Date): string {
  const s = toDate(start);
  const e = toDate(end);
  const optsDay = { day: "numeric" } as const;
  const optsDayMonth = { day: "numeric", month: "short" } as const;
  const startStr = s.toLocaleDateString("es-CL", optsDayMonth).replace(".", "");
  const endStr = e.toLocaleDateString("es-CL", optsDayMonth).replace(".", "");
  if (s.getMonth() === e.getMonth()) {
    const startNoMonth = s.toLocaleDateString("es-CL", optsDay);
    return `${startNoMonth} – ${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}
