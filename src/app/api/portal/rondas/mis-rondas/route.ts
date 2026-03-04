import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile } from "@/lib/rondas/timezone";

export async function GET(request: NextRequest) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    const installationId = request.nextUrl.searchParams.get("installationId");
    const tenantId = request.nextUrl.searchParams.get("tenantId");

    if (!guardiaId || !installationId || !tenantId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    // Get active templates for this installation
    const templates = await prisma.opsRondaTemplate.findMany({
      where: { tenantId, installationId, isActive: true },
      include: {
        checkpoints: {
          include: { checkpoint: { select: { id: true, name: true, instrucciones: true, qrCode: true, lat: true, lng: true, geoRadiusM: true, verificationType: true } } },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    // Get today's ejecuciones for this guard (Chile timezone)
    const now = new Date();
    const startOfDay = startOfDayChile(now);
    const endOfDay = endOfDayChile(now);

    // Show ALL pending/in-progress rounds for this installation today.
    // Any authenticated guard can take any round, regardless of assignment.
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        rondaTemplateId: { in: templates.map(t => t.id) },
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ["pendiente", "en_curso", "incompleta", "completada"] },
      },
      include: {
        marcaciones: {
          select: { checkpointId: true, status: true, timestamp: true },
        },
        programacion: { select: { toleranciaMinutos: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const result = ejecuciones.map(ej => {
      const template = templates.find(t => t.id === ej.rondaTemplateId);
      return {
        ejecucionId: ej.id,
        templateId: ej.rondaTemplateId,
        templateName: template?.name ?? "Ronda",
        status: ej.status,
        scheduledAt: ej.scheduledAt.toISOString(),
        startedAt: ej.startedAt?.toISOString() ?? null,
        checkpointsTotal: ej.checkpointsTotal,
        checkpointsCompletados: ej.checkpointsCompletados,
        qrRequerido: template?.qrRequerido ?? false,
        orderMode: template?.orderMode ?? "flexible",
        estimatedDurationMin: template?.estimatedDurationMin ?? null,
        toleranciaMinutos: ej.programacion?.toleranciaMinutos ?? 10,
        trustScore: ej.trustScore,
        porcentajeCompletado: ej.porcentajeCompletado,
        checkpoints: template?.checkpoints.map(tc => ({
          id: tc.checkpoint.id,
          name: tc.checkpoint.name,
          qrCode: tc.checkpoint.qrCode,
          lat: tc.checkpoint.lat,
          lng: tc.checkpoint.lng,
          geoRadiusM: tc.checkpoint.geoRadiusM,
          verificationType: tc.checkpoint.verificationType,
          orderIndex: tc.orderIndex,
          isRequired: tc.isRequired,
          completed: ej.marcaciones.some(m => m.checkpointId === tc.checkpointId && m.status === "COMPLETED"),
        })) ?? [],
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Portal Rondas] Mis rondas error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener rondas" }, { status: 500 });
  }
}
