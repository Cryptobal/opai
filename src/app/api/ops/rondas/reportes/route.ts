import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";
import { asRouteSnapshot, asWalkRoute } from "@/lib/rondas/ejecucion-map-helpers";
import { requireTenantModule } from '@/lib/require-module';
import { onlyActiveInstallationEjecucion } from "@/lib/rondas/active-installation-filter";

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const format = sp.get("format");
    const installationId = sp.get("installationId");
    const guardiaId = sp.get("guardiaId");
    const statusFilter = sp.get("status");
    const pageParam = sp.get("page");
    const pageSizeParam = sp.get("pageSize");
    const ejecucionId = sp.get("ejecucionId");

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Fix: dateTo should include the entire end day (23:59:59.999)
    const dateTo = to ? new Date(to + "T23:59:59.999Z") : new Date();

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      scheduledAt: { gte: dateFrom, lte: dateTo },
      // Ocultar ejecuciones de instalaciones inactivas (consistente con el selector)
      ...onlyActiveInstallationEjecucion,
    };
    if (installationId) {
      where.OR = [
        { installationId },
        { rondaTemplate: { installationId } },
      ];
    }
    if (guardiaId) where.guardiaId = guardiaId;
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;
    // Deep link (Fase 19): una ejecución puntual, sin importar el rango de fechas.
    if (ejecucionId) {
      where.id = ejecucionId;
      delete where.scheduledAt;
    }

    // Server-side pagination (skip CSV exports which need all rows)
    const page = pageParam != null ? Math.max(0, parseInt(pageParam, 10) || 0) : null;
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "20", 10) || 20));
    const isExport = format === "csv";

    const [rows, totalCount] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where,
        include: {
          rondaTemplate: {
            select: {
              name: true,
              installationId: true,
              installation: { select: { id: true, name: true } },
            },
          },
          installation: { select: { id: true, name: true } },
          guardia: {
            include: {
              persona: { select: { firstName: true, lastName: true, rut: true } },
            },
          },
          marcaciones: {
            select: {
              id: true,
              checkpointId: true,
              timestamp: true,
              status: true,
              fotoEvidenciaUrl: true,
              audioUrl: true,
              geoDistanciaM: true,
              lat: true,
              lng: true,
              geoValidada: true,
              geoAccuracy: true,
              geoConfidence: true,
              verificationMethod: true,
              hashIntegridad: true,
              checkpoint: { select: { name: true } },
            },
            orderBy: { timestamp: "asc" },
          },
          _count: {
            select: { incidentes: true },
          },
          incidentes: {
            select: {
              id: true,
              tipo: true,
              status: true,
              descripcion: true,
              createdAt: true,
            },
          },
        },
        orderBy: { scheduledAt: "desc" },
        ...(isExport
          ? { take: 10000 as number }
          : page != null
            ? { skip: page * pageSize, take: pageSize }
            : { take: 2000 as number }),
      }),
      prisma.opsRondaEjecucion.count({ where }),
    ]);

    const mapped = rows.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduledAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      installationId: row.installationId ?? row.rondaTemplate?.installationId ?? null,
      installation: row.rondaTemplate?.installation?.name ?? (row as any).installation?.name ?? "Sin instalación",
      template: row.rondaTemplate?.name ?? (row.isAdHoc ? "Ronda Libre" : "Sin plantilla"),
      isAdHoc: row.isAdHoc,
      guardiaId: row.guardiaId,
      guardia: row.guardia
        ? formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)
        : "",
      guardiaCode: row.guardia?.code ?? "",
      rut: row.guardia?.persona.rut ?? "",
      status: row.status,
      checkpointsTotal: row.checkpointsTotal,
      checkpointsCompletados: row.checkpointsCompletados,
      porcentajeCompletado: row.porcentajeCompletado,
      trustScore: row.trustScore,
      trustBreakdown: row.trustBreakdown,
      durationMinutes: row.durationMinutes,
      notes: row.notes ?? null,
      walkRoute: asWalkRoute(row.walkRoute),
      routeSnapshot: asRouteSnapshot(row.routeSnapshot),
      marcaciones: row.marcaciones.map((m) => ({
        id: m.id,
        checkpointName: m.checkpoint?.name ?? (m.checkpointId ? "Checkpoint eliminado" : "Punto GPS"),
        timestamp: m.timestamp.toISOString(),
        status: m.status,
        hasPhoto: !!m.fotoEvidenciaUrl,
        fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
        hasAudio: !!m.audioUrl,
        distanceM: m.geoDistanciaM,
        lat: m.lat,
        lng: m.lng,
        googleMapsUrl: m.lat && m.lng ? `https://maps.google.com/?q=${m.lat},${m.lng}` : null,
        geoValidada: m.geoValidada,
        geoAccuracyM: m.geoAccuracy,
        geoConfidence: m.geoConfidence,
        verificationMethod: m.verificationMethod,
        hashIntegridad: m.hashIntegridad,
      })),
      _count: { incidentes: (row as any)._count?.incidentes ?? 0 },
      incidentes: ((row as any).incidentes ?? []).map((inc: any) => ({
        id: inc.id,
        tipo: inc.tipo,
        status: inc.status,
        descripcion: inc.descripcion,
        createdAt: inc.createdAt?.toISOString?.() ?? inc.createdAt,
      })),
    }));

    if (format === "csv") {
      const header =
        "Fecha,Instalación,Plantilla,Guardia,RUT,Estado,CheckpointsTotal,CheckpointsCompletados,Cumplimiento%,TrustScore,Duración(min)";
      const lines = mapped.map((r) =>
        [
          r.scheduledAt,
          r.installation,
          r.template,
          r.guardia,
          r.rut,
          r.status,
          r.checkpointsTotal,
          r.checkpointsCompletados,
          Math.round(r.porcentajeCompletado),
          r.isAdHoc ? "N/A" : r.trustScore,
          r.durationMinutes ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      );
      return new NextResponse([header, ...lines].join("\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="rondas-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Aggregate totals from DB for accuracy (not limited by pagination)
    const trustWhere = { ...where, isAdHoc: false };

    const [statusCounts, trustAgg, allForDaily] = await Promise.all([
      prisma.opsRondaEjecucion.groupBy({
        by: ["status"],
        where,
        _count: { id: true },
      }),
      prisma.opsRondaEjecucion.aggregate({
        where: trustWhere,
        _avg: { trustScore: true },
      }),
      prisma.opsRondaEjecucion.findMany({
        where,
        select: { scheduledAt: true, status: true },
      }),
    ]);

    const statusMap = new Map<string, number>(statusCounts.map((s: any) => [s.status, s._count.id]));
    const completadas = statusMap.get("completada") ?? 0;
    const incompletas = statusMap.get("incompleta") ?? 0;
    const noRealizadas = statusMap.get("no_realizada") ?? 0;

    const dailyMap = new Map<string, { total: number; completed: number }>();
    for (const r of allForDaily) {
      const day = r.scheduledAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { total: 0, completed: 0 };
      entry.total++;
      if (r.status === "completada") entry.completed++;
      dailyMap.set(day, entry);
    }
    const dailyCompliance = Array.from(dailyMap.entries())
      .map(([date, d]) => ({
        date,
        compliance: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        total: d.total,
        completed: d.completed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: {
        rows: mapped,
        totals: {
          total: totalCount,
          completadas,
          incompletas,
          noRealizadas,
          compliance: totalCount > 0 ? Math.round((completadas / totalCount) * 100) : 0,
          trustPromedio: Math.round(trustAgg._avg.trustScore ?? 0),
        },
        dailyCompliance,
        pagination: page != null ? { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) } : null,
      },
    });
  } catch (error) {
    console.error("[RONDAS] reportes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
