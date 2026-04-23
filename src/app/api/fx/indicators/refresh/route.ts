/**
 * API Route: POST /api/fx/indicators/refresh
 *
 * Fuerza una re-sincronización de UF (hoy) y UTM (mes vigente) desde las
 * fuentes externas (CMF → mindicador.cl como fallback). Invocado por el
 * botón "Actualizar" del widget de indicadores del CPQ.
 *
 * Se deja abierto en el middleware (`/api/fx/indicators` ya requiere sesión
 * ERP), así que cualquier usuario logeado puede disparar un refresh manual.
 * A diferencia de `/api/fx/sync` (cron con CRON_SECRET), este endpoint:
 *  - es POST (no idempotente en el sentido de "re-fetch siempre"),
 *  - devuelve un payload listo para la UI.
 */

import { NextResponse } from "next/server";
import { forceRefreshFxRates } from "@/lib/fx-sync";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnlyMonthYearEs,
  formatDateOnlyShortEs,
  formatDateOnlyShortWithYearEs,
  todayChileStr,
} from "@/lib/fx-date";

export async function POST() {
  try {
    const refreshResult = await forceRefreshFxRates();

    // Después del refresh, leemos el estado actual de BD para devolver al UI
    // los mismos campos que `/api/fx/indicators`.
    const today = new Date(`${todayChileStr()}T00:00:00Z`);
    const [ufToday, ufFallback, latestUtm] = await Promise.all([
      prisma.fxUfRate.findUnique({ where: { date: today } }),
      prisma.fxUfRate.findFirst({ orderBy: { date: "desc" } }),
      prisma.fxUtmRate.findFirst({ orderBy: { month: "desc" } }),
    ]);
    const latestUf = ufToday ?? ufFallback;

    const ufValue = latestUf ? Number(latestUf.value) : null;
    const utmValue = latestUtm ? Number(latestUtm.value) : null;
    const ufDate = latestUf?.date
      ? formatDateOnlyShortEs(new Date(latestUf.date))
      : null;
    const utmMonth = latestUtm?.month
      ? formatDateOnlyMonthYearEs(new Date(latestUtm.month))
      : null;
    const utmMonthShort = latestUtm?.month
      ? formatDateOnlyShortWithYearEs(new Date(latestUtm.month))
      : null;

    return NextResponse.json({
      success: true,
      refreshed: {
        uf: refreshResult.uf,
        utm: refreshResult.utm,
      },
      data: {
        uf: ufValue != null ? { value: ufValue, date: ufDate } : null,
        utm:
          utmValue != null
            ? { value: utmValue, month: utmMonth, monthShort: utmMonthShort }
            : null,
      },
    });
  } catch (error) {
    console.error("[fx-refresh] error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar los indicadores" },
      { status: 500 },
    );
  }
}
