import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { z } from "zod";
import { roadRouteGeometry } from "@/lib/finance/mileage";

/**
 * POST /api/finance/trips/route-geometry
 * Devuelve la geometría (polyline decodificada) de la ruta por carretera entre
 * inicio y fin, para que el mapa del detalle de la rendición dibuje el trayecto
 * real en auto en vez de una línea recta. Es retroactivo: sirve también para
 * viajes ya guardados (no depende de routePoints GPS).
 */

const geometrySchema = z.object({
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    // Solo lectura: basta con poder ver rendiciones (incluye aprobadores).
    if (!canView(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, geometrySchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const { path, source, fallbackReason } = await roadRouteGeometry(
      body.startLat,
      body.startLng,
      body.endLat,
      body.endLng,
    );

    return NextResponse.json({
      success: true,
      data: { path, source, fallbackReason },
    });
  } catch (error) {
    console.error("[Finance] Error route-geometry:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la ruta" },
      { status: 500 },
    );
  }
}
