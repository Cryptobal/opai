import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const guardiaId = sp.get("guardiaId");
    const tenantId = sp.get("tenantId");
    const limitParam = sp.get("limit");
    const offsetParam = sp.get("offset");

    if (!guardiaId || !tenantId) {
      return NextResponse.json(
        { success: false, error: "guardiaId y tenantId son requeridos" },
        { status: 400 },
      );
    }

    if (!UUID_RE.test(guardiaId)) {
      return NextResponse.json(
        { success: false, error: "Formato de guardiaId inválido" },
        { status: 400 },
      );
    }

    const limit = Math.min(Math.max(parseInt(limitParam ?? "30", 10) || 30, 1), 100);
    const offset = Math.max(parseInt(offsetParam ?? "0", 10) || 0, 0);

    // Validate guardia belongs to tenantId
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true },
    });

    if (!guardia || guardia.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o no autorizado" },
        { status: 403 },
      );
    }

    // 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const where = {
      guardiaId,
      tenantId,
      status: { in: ["completada", "incompleta", "cerrada_auto"] as string[] },
      completedAt: { not: null, gte: thirtyDaysAgo },
    };

    const [ejecuciones, total] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where,
        select: {
          id: true,
          isAdHoc: true,
          status: true,
          completedAt: true,
          durationMinutes: true,
          porcentajeCompletado: true,
          trustScore: true,
          checkpointsTotal: true,
          checkpointsCompletados: true,
          rondaTemplate: { select: { name: true } },
          installation: { select: { name: true } },
        },
        orderBy: { completedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.opsRondaEjecucion.count({ where }),
    ]);

    const data = ejecuciones.map((ej) => ({
      ejecucionId: ej.id,
      templateName: ej.isAdHoc ? "Ronda Libre" : (ej.rondaTemplate?.name ?? "Ronda"),
      installationName: ej.installation?.name ?? "",
      completedAt: ej.completedAt!.toISOString(),
      durationMinutes: ej.durationMinutes ?? null,
      porcentajeCompletado: ej.porcentajeCompletado,
      trustScore: ej.trustScore,
      checkpointsTotal: ej.checkpointsTotal,
      checkpointsCompletados: ej.checkpointsCompletados,
      status: ej.status,
      isAdHoc: ej.isAdHoc,
    }));

    return NextResponse.json({ success: true, data, total });
  } catch (error: unknown) {
    console.error("[Portal] Historial rondas error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historial de rondas" },
      { status: 500 },
    );
  }
}
