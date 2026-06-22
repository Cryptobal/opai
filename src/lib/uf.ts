import "server-only";

import { prisma } from "@/lib/prisma";
import { todayChileDate, todayChileStr } from "@/lib/fx-date";
import { clpToUf, ufToClp } from "@/lib/uf-utils";

/**
 * Obtiene la UF vigente para el día de hoy (Chile).
 * Usado por cotizaciones y payroll: siempre debe ser la UF del día.
 * Orden: 1) UF de hoy en BD, 2) última UF en BD, 3) CMF API para hoy, 4) valor aproximado.
 */
export async function getUfValue(): Promise<number> {
  try {
    const today = todayChileDate();
    const rateToday = await prisma.fxUfRate.findUnique({
      where: { date: today },
    });
    if (rateToday) return Number(rateToday.value);

    const rateLatest = await prisma.fxUfRate.findFirst({
      orderBy: { date: "desc" },
    });
    if (rateLatest) return Number(rateLatest.value);
  } catch {
    // DB query failed, try API fallback
  }

  const cmfApiKey = process.env.CMF_API_KEY;
  if (cmfApiKey) {
    try {
      const [y, m, d] = todayChileStr().split("-");
      const url = `https://api.cmfchile.cl/api-sbifv3/recursos_api/uf/${y}/${m}/dias/${d}?apikey=${cmfApiKey}&formato=json`;
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        const ufStr = data?.UFs?.[0]?.Valor;
        if (ufStr) {
          return parseFloat(ufStr.replace(/\./g, "").replace(",", "."));
        }
      }
    } catch {
      // API failed
    }
  }

  return 38000;
}

/**
 * Obtiene la UF para una fecha específica (UTC date YYYY-MM-DD).
 *
 * Orden de resolución:
 *   1) UF exacta de esa fecha en BD.
 *   2) Si no está, la pide a la API por esa fecha exacta (CMF / mindicador)
 *      y la cachea en BD. En Chile la UF de la segunda quincena se publica
 *      anticipadamente, así que el "último día del mes en curso" ya existe
 *      aunque el mes no haya terminado.
 *   3) Si la API no la trae (feriado fuera de rango, sin red), cae a la
 *      última UF anterior en BD.
 *   4) Si no hay nada, getUfValue() (CMF de hoy o el default).
 *
 * Usado por facturación recurrente con UF policy: permite "fijar" la
 * UF a la del último día del mes en curso, mes anterior, etc.
 */
export async function getUfValueForDate(date: Date): Promise<number> {
  try {
    const exact = await prisma.fxUfRate.findUnique({ where: { date } });
    if (exact) return Number(exact.value);

    // Miss de la fecha exacta: intentamos traerla de la API antes de
    // caer al "último anterior" (que devolvería un valor obsoleto con la
    // fecha equivocada en el documento).
    const dateStr = date.toISOString().slice(0, 10);
    try {
      const { fetchUfBestEffort, upsertUfRate } = await import("@/lib/fx-sync");
      const fetched = await fetchUfBestEffort(dateStr);
      if (fetched && isoToDateOnly(fetched.data.date) === dateStr) {
        await upsertUfRate(fetched.data, fetched.source).catch(() => {
          // El cache es best-effort; si el upsert falla igual usamos el valor.
        });
        return fetched.data.value;
      }
    } catch {
      // API/red falló — seguimos al fallback de BD.
    }

    const before = await prisma.fxUfRate.findFirst({
      where: { date: { lte: date } },
      orderBy: { date: "desc" },
    });
    if (before) return Number(before.value);
  } catch {
    // fall through to default
  }
  return getUfValue();
}

/** Extrae YYYY-MM-DD de un ISO/fecha respetando los primeros 10 chars. */
function isoToDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export { clpToUf, ufToClp };
