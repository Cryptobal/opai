import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId");
    if (!installationId) {
      return NextResponse.json({ success: false, error: "installationId requerido" }, { status: 400 });
    }

    const from = sp.get("from");
    const to = sp.get("to");
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to + "T23:59:59.999Z") : new Date();

    const checkpoints = await prisma.opsCheckpoint.findMany({
      where: { tenantId: ctx.tenantId, installationId, isActive: true },
      select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true },
    });

    const totalRounds = await prisma.opsRondaEjecucion.count({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        scheduledAt: { gte: dateFrom, lte: dateTo },
        status: { in: ["completada", "incompleta"] },
      },
    });

    const cpIds = checkpoints.map((c) => c.id);
    const marcaciones = cpIds.length > 0
      ? await prisma.opsMarcacionCheckpoint.groupBy({
          by: ["checkpointId"],
          where: {
            tenantId: ctx.tenantId,
            checkpointId: { in: cpIds },
            status: "COMPLETED",
            timestamp: { gte: dateFrom, lte: dateTo },
          },
          _count: { id: true },
          _max: { timestamp: true },
        })
      : [];

    const marcMap = new Map(
      marcaciones.map((m) => [m.checkpointId, { count: m._count.id, lastAt: m._max.timestamp }]),
    );

    const data = checkpoints
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => {
        const m = marcMap.get(c.id);
        const count = m?.count ?? 0;
        const coverage = totalRounds > 0 ? Math.round((count / totalRounds) * 100) : 0;
        return {
          id: c.id,
          name: c.name,
          lat: c.lat!,
          lng: c.lng!,
          radiusM: c.geoRadiusM,
          totalMarks: count,
          totalRounds,
          coveragePercent: coverage,
          lastMarkedAt: m?.lastAt?.toISOString() ?? null,
        };
      });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[RONDAS] reportes/heatmap", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
