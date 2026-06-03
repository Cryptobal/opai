import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { z } from "zod";
import { roadDistanceKm, mileageBreakdown } from "@/lib/finance/mileage";

/**
 * POST /api/finance/trips/estimate
 * Calcula distancia (por carretera) y desglose de costo SIN crear nada.
 * El preview del formulario usa este endpoint para que lo mostrado sea idéntico
 * a lo que se guardará al cerrar el viaje.
 */

const estimateSchema = z.object({
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  tollAmount: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, estimateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    const kmPerLiter = config ? Number(config.kmPerLiter) : 10;
    const fuelPricePerLiter = config?.fuelPricePerLiter ?? 1500;
    const vehicleFeePct = config ? Number(config.vehicleFeePct) : 10;

    const { distanceKm, source } = await roadDistanceKm(
      body.startLat,
      body.startLng,
      body.endLat,
      body.endLng,
    );

    const breakdown = mileageBreakdown({
      distanceKm,
      kmPerLiter,
      fuelPricePerLiter,
      vehicleFeePct,
      tollAmount: body.tollAmount ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: { ...breakdown, source, vehicleFeePct },
    });
  } catch (error) {
    console.error("[Finance] Error estimating trip:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo estimar el trayecto" },
      { status: 500 },
    );
  }
}
