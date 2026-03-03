import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";

export async function GET(request: NextRequest) {
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

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      scheduledAt: { gte: dateFrom, lte: dateTo },
    };
    if (installationId) where.installationId = installationId;
    if (guardiaId) where.guardiaId = guardiaId;
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;

    const rows = await prisma.opsRondaEjecucion.findMany({
      where,
      include: {
        rondaTemplate: {
          select: {
            name: true,
            installationId: true,
            installation: { select: { id: true, name: true } },
          },
        },
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
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 2000,
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduledAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      installationId: row.installationId ?? row.rondaTemplate.installationId,
      installation: row.rondaTemplate.installation.name,
      template: row.rondaTemplate.name,
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
      marcaciones: row.marcaciones.map((m) => ({
        id: m.id,
        checkpointName: m.checkpoint.name,
        timestamp: m.timestamp.toISOString(),
        status: m.status,
        hasPhoto: !!m.fotoEvidenciaUrl,
        hasAudio: !!m.audioUrl,
        distanceM: m.geoDistanciaM,
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
          r.trustScore,
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

    const completadas = rows.filter((r) => r.status === "completada").length;
    const compliance = rows.length ? Math.round((completadas / rows.length) * 100) : 0;
    const trustSum = rows.reduce((acc, r) => acc + (r.trustScore ?? 0), 0);

    const dailyMap = new Map<string, { total: number; completed: number }>();
    for (const r of rows) {
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
          total: rows.length,
          completadas,
          incompletas: rows.filter((r) => r.status === "incompleta").length,
          noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
          compliance,
          trustPromedio: rows.length ? Math.round(trustSum / rows.length) : 0,
        },
        dailyCompliance,
      },
    });
  } catch (error) {
    console.error("[RONDAS] reportes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
