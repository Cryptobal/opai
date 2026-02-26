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

export { clpToUf, ufToClp };
