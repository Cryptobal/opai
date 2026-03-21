import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { asRouteSnapshot, asWalkRoute } from "@/lib/rondas/ejecucion-map-helpers";

const MAX_TRACKING_POINTS = 12_000;

/**
 * Mapa de auditoría: prioridad de trazo → marcaciones (coord GPS de cada checkpoint marcado
 * en orden temporal) → walkRoute → tracking periódico.
 * Siempre devuelve todos los checkpoints de la plantilla para mostrar los no marcados.
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
        rondaTemplateId: true,
        installationId: true,
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

    // Fetch all template checkpoints so we can show unmarked ones on the map
    let allTemplateCheckpoints: Array<{
      id: string;
      name: string;
      lat: number | null;
      lng: number | null;
      orderIndex: number;
    }> = [];

    if (ejecucion.rondaTemplateId) {
      const rondaCheckpoints = await prisma.opsRondaCheckpoint.findMany({
        where: { rondaTemplateId: ejecucion.rondaTemplateId },
        orderBy: { orderIndex: "asc" },
        select: {
          orderIndex: true,
          checkpoint: { select: { id: true, name: true, lat: true, lng: true } },
        },
      });
      allTemplateCheckpoints = rondaCheckpoints
        .filter((rc) => rc.checkpoint.lat != null && rc.checkpoint.lng != null)
        .map((rc) => ({
          id: rc.checkpoint.id,
          name: rc.checkpoint.name,
          lat: rc.checkpoint.lat,
          lng: rc.checkpoint.lng,
          orderIndex: rc.orderIndex,
        }));
    } else if (ejecucion.installationId) {
      // Ad-hoc round: get all installation checkpoints
      const instCheckpoints = await prisma.opsCheckpoint.findMany({
        where: { installationId: ejecucion.installationId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, lat: true, lng: true, sortOrder: true },
      });
      allTemplateCheckpoints = instCheckpoints
        .filter((cp) => cp.lat != null && cp.lng != null)
        .map((cp, i) => ({
          id: cp.id,
          name: cp.name,
          lat: cp.lat,
          lng: cp.lng,
          orderIndex: cp.sortOrder ?? i,
        }));
    }

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
      checkpointId: m.checkpointId,
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

    // Route source priority:
    // 1. marcaciones (GPS coords from each checkpoint mark, in time order) — most accurate
    // 2. walkRoute (client-side accumulated trail, only present when guard completes manually)
    // 3. tracking (periodic 30s GPS pings)
    const marcacionesWithCoords = marcaciones.filter(
      (m) => m.lat != null && m.lng != null && Number(m.lat) !== 0 && Number(m.lng) !== 0,
    );

    let routeSource: "marcaciones" | "walk_route" | "tracking" | "none" = "none";
    if (marcacionesWithCoords.length >= 2) routeSource = "marcaciones";
    else if (walkRoute && walkRoute.length >= 2) routeSource = "walk_route";
    else if (trackingRoute.length >= 2) routeSource = "tracking";

    // Build the set of marked checkpoint IDs for quick lookup
    const markedCheckpointIds = new Set(
      marcaciones.filter((m) => m.status === "COMPLETED").map((m) => m.checkpointId).filter(Boolean),
    );

    // Merge template checkpoints with marcaciones to produce the full checkpoint list
    // Each entry shows position (from template) + marked status + geoValidada
    const checkpointStatuses = allTemplateCheckpoints.map((cp) => {
      const marcacion = marcaciones.find(
        (m) => m.checkpointId === cp.id && m.status === "COMPLETED",
      );
      return {
        id: cp.id,
        name: cp.name,
        lat: cp.lat as number,
        lng: cp.lng as number,
        orderIndex: cp.orderIndex,
        status: markedCheckpointIds.has(cp.id) ? "COMPLETED" : "PENDING",
        geoValidada: marcacion?.geoValidada ?? null,
        distanceM: marcacion?.distanceM ?? null,
        timestamp: marcacion?.timestamp ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        walkRoute,
        trackingRoute,
        routeSnapshot,
        marcaciones,
        checkpointStatuses,
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
