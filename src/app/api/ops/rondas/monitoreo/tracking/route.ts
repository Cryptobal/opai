import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from "@/lib/require-module";

/**
 * GET /api/ops/rondas/monitoreo/tracking
 * Returns tracking points for all active rondas (en_curso).
 * Used by the monitor map to draw guard walking paths.
 */
export async function GET() {
  const modCheck = await requireTenantModule("ops_rondas");
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Get all active ejecuciones
    const activeEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: { tenantId: ctx.tenantId, status: "en_curso" },
      select: { id: true, guardiaId: true },
    });

    if (activeEjecuciones.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch tracking points for all active ejecuciones
    const trackingPoints = await prisma.opsRondaTracking.findMany({
      where: {
        ejecucionId: { in: activeEjecuciones.map((e) => e.id) },
      },
      orderBy: { createdAt: "asc" },
      select: {
        ejecucionId: true,
        lat: true,
        lng: true,
        createdAt: true,
      },
    });

    // Group by ejecucionId
    const grouped: Record<string, Array<{ lat: number; lng: number; t: string }>> = {};
    for (const point of trackingPoints) {
      if (!grouped[point.ejecucionId]) {
        grouped[point.ejecucionId] = [];
      }
      grouped[point.ejecucionId].push({
        lat: point.lat,
        lng: point.lng,
        t: point.createdAt.toISOString(),
      });
    }

    const result = activeEjecuciones.map((ej) => ({
      ejecucionId: ej.id,
      guardiaId: ej.guardiaId,
      points: grouped[ej.id] ?? [],
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[MONITOREO] tracking error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
