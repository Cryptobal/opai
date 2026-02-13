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

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const format = request.nextUrl.searchParams.get("format");

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const rows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        scheduledAt: { gte: dateFrom, lte: dateTo },
      },
      include: {
        rondaTemplate: {
          select: { name: true, installation: { select: { name: true } } },
        },
        guardia: { include: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    const mapped = rows.map((row) => ({
      scheduledAt: row.scheduledAt.toISOString(),
      installation: row.rondaTemplate.installation.name,
      template: row.rondaTemplate.name,
      guardia: row.guardia ? `${row.guardia.persona.firstName} ${row.guardia.persona.lastName}` : "",
      rut: row.guardia?.persona.rut ?? "",
      status: row.status,
      checkpointsTotal: row.checkpointsTotal,
      checkpointsCompletados: row.checkpointsCompletados,
      porcentajeCompletado: row.porcentajeCompletado,
      trustScore: row.trustScore,
    }));

    if (format === "csv") {
      const header = "scheduledAt,installation,template,guardia,rut,status,checkpointsTotal,checkpointsCompletados,porcentajeCompletado,trustScore";
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
          r.porcentajeCompletado,
          r.trustScore,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",")
      );
      return new NextResponse([header, ...lines].join("\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="rondas-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const compliance = rows.length
      ? Math.round((rows.filter((r) => r.status === "completada").length / rows.length) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        rows: mapped,
        totals: {
          total: rows.length,
          completadas: rows.filter((r) => r.status === "completada").length,
          incompletas: rows.filter((r) => r.status === "incompleta").length,
          noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
          compliance,
          trustPromedio: rows.length
            ? Math.round(rows.reduce((acc, r) => acc + (r.trustScore ?? 0), 0) / rows.length)
            : 0,
        },
      },
    });
  } catch (error) {
    console.error("[RONDAS] reportes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
