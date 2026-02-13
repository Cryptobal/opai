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

    const dateFrom = from ? new Date(from) : new Date(new Date().toISOString().slice(0, 10));
    const dateTo = to ? new Date(to) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const rows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        scheduledAt: { gte: dateFrom, lte: dateTo },
      },
      include: {
        rondaTemplate: {
          select: {
            id: true,
            name: true,
            installation: { select: { id: true, name: true } },
          },
        },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });

    const stats = {
      total: rows.length,
      completadas: rows.filter((r) => r.status === "completada").length,
      enCurso: rows.filter((r) => r.status === "en_curso").length,
      pendientes: rows.filter((r) => r.status === "pendiente").length,
      noRealizadas: rows.filter((r) => r.status === "no_realizada").length,
      trustPromedio: rows.length
        ? Math.round(rows.reduce((acc, r) => acc + (r.trustScore ?? 0), 0) / rows.length)
        : 0,
    };

    return NextResponse.json({ success: true, data: { rows, stats } });
  } catch (error) {
    console.error("[RONDAS] GET dashboard", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
