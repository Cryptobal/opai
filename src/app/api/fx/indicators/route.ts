/**
 * API Route: /api/fx/indicators
 * GET - Retorna UF del día (hoy Chile) y UTM del mes para la barra global.
 * Siempre prioriza UF de la fecha de hoy para que cotizaciones y payroll usen valor vigente.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayChileDate } from "@/lib/fx-date";

export async function GET() {
  try {
    const today = todayChileDate();

    // UF: preferir la del día de hoy (Chile); si no existe, usar la más reciente
    const ufToday = await prisma.fxUfRate.findUnique({
      where: { date: today },
    });
    const ufFallback = await prisma.fxUfRate.findFirst({
      orderBy: { date: "desc" },
    });
    const latestUf = ufToday ?? ufFallback;

    // UTM: mes actual (vigente)
    const latestUtm = await prisma.fxUtmRate.findFirst({
      orderBy: { month: "desc" },
    });

    const ufValue = latestUf ? Number(latestUf.value) : null;
    const utmValue = latestUtm ? Number(latestUtm.value) : null;
    const ufDate = latestUf?.date
      ? new Date(latestUf.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
      : null;
    const utmMonth = latestUtm?.month
      ? new Date(latestUtm.month).toLocaleDateString("es-CL", { month: "long", year: "numeric" })
      : null;
    const utmMonthShort = latestUtm?.month
      ? new Date(latestUtm.month).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
      : null;
    const utmFetchedAt = latestUtm?.fetchedAt
      ? new Date(latestUtm.fetchedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
      : null;

    return NextResponse.json({
      success: true,
      data: {
        uf: ufValue != null ? { value: ufValue, date: ufDate } : null,
        utm:
          utmValue != null
            ? { value: utmValue, month: utmMonth, monthShort: utmMonthShort, updatedAt: utmFetchedAt }
            : null,
      },
    });
  } catch (error) {
    console.error("Error fetching FX indicators:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los indicadores" },
      { status: 500 }
    );
  }
}
