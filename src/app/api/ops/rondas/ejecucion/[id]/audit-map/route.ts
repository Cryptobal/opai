import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { asRouteSnapshot, asWalkRoute } from "@/lib/rondas/ejecucion-map-helpers";

const MAX_TRACKING_POINTS = 12_000;

/**
 * Mapa de auditoría: walkRoute guardado, tracking en BD, snapshot y marcaciones.
 * Sirve para ver el recorrido aunque la ronda no se haya completado con walkRoute.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id: ejecucionId } = await params;

    const ejecucion = await prisma.opsRondaEjecucion.findFirst({
      where: { id: ejecucionId, tenantId: ctx.tenantId },
      select: {
        id: true,
        walkRoute: true,
        routeSnapshot: true,
        isAdHoc: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        trustScore: true,
      },
    });

    if (!ejecucion) {
      return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });
    }

    const [trackingRows, marcacionesRows] = await Promise.all([
      prisma.opsRondaTracking.findMany({
        where: { ejecucionId },
        orderBy: { createdAt: "asc" },
        take: MAX_TRACKING_POINTS,
        select: { lat: true, lng: true, createdAt: true, accuracy: true },
      }),
      prisma.opsMarcacionCheckpoint.findMany({
        where: { ejecucionId },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          timestamp: true,
          status: true,
          geoDistanciaM: true,
          lat: true,
          lng: true,
          geoValidada: true,
          verificationMethod: true,
          checkpoint: { select: { name: true } },
          checkpointId: true,
        },
      }),
    ]);

    const walkRoute = asWalkRoute(ejecucion.walkRoute);
    const routeSnapshot = asRouteSnapshot(ejecucion.routeSnapshot);

    const trackingRoute = trackingRows.map((t) => ({
      lat: t.lat,
      lng: t.lng,
      createdAt: t.createdAt.toISOString(),
      accuracy: t.accuracy,
    }));

    const marcaciones = marcacionesRows.map((m) => ({
      id: m.id,
      checkpointName: m.checkpoint?.name ?? (m.checkpointId ? "Checkpoint" : "Punto GPS"),
      timestamp: m.timestamp.toISOString(),
      status: m.status,
      hasPhoto: false as boolean,
      hasAudio: false as boolean,
      distanceM: m.geoDistanciaM,
      lat: m.lat,
      lng: m.lng,
      googleMapsUrl:
        m.lat != null && m.lng != null ? `https://maps.google.com/?q=${m.lat},${m.lng}` : null,
      geoValidada: m.geoValidada,
      verificationMethod: m.verificationMethod,
    }));

    let routeSource: "walk_route" | "tracking" | "marcaciones" | "none" = "none";
    if (walkRoute && walkRoute.length >= 2) routeSource = "walk_route";
    else if (trackingRoute.length >= 2) routeSource = "tracking";
    else {
      const withCoords = marcaciones.filter((m) => m.lat != null && m.lng != null);
      if (withCoords.length >= 2) routeSource = "marcaciones";
    }

    return NextResponse.json({
      success: true,
      data: {
        walkRoute,
        trackingRoute,
        routeSnapshot,
        marcaciones,
        routeSource,
        meta: {
          isAdHoc: ejecucion.isAdHoc,
          status: ejecucion.status,
          scheduledAt: ejecucion.scheduledAt.toISOString(),
          startedAt: ejecucion.startedAt?.toISOString() ?? null,
          completedAt: ejecucion.completedAt?.toISOString() ?? null,
          trustScore: ejecucion.trustScore,
        },
      },
    });
  } catch (e) {
    console.error("[audit-map]", e);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
