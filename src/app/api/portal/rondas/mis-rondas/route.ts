import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile } from "@/lib/rondas/timezone";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    const installationId = request.nextUrl.searchParams.get("installationId");
    const tenantId = request.nextUrl.searchParams.get("tenantId");

    if (!guardiaId || !installationId || !tenantId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    if (!UUID_RE.test(guardiaId) || !UUID_RE.test(installationId)) {
      return NextResponse.json(
        { success: false, error: "Formato de parámetros inválido" },
        { status: 400 },
      );
    }

    // Get active templates for this installation
    const templates = await prisma.opsRondaTemplate.findMany({
      where: { tenantId, installationId, isActive: true },
      include: {
        checkpoints: {
          include: {
            checkpoint: {
              select: {
                id: true, name: true, instrucciones: true, qrCode: true,
                lat: true, lng: true, geoRadiusM: true, verificationType: true,
                tasks: {
                  where: { isActive: true },
                  orderBy: { sortOrder: "asc" },
                  select: { id: true, label: true, type: true, required: true, options: true, config: true, sortOrder: true },
                },
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    // Get today's ejecuciones + overnight rondas (Chile timezone)
    const now = new Date();
    // -6h captures evening shift starts from previous day (e.g., 18:00)
    const startOfDay = new Date(startOfDayChile(now).getTime() - 6 * 60 * 60 * 1000);
    // +10h past midnight captures overnight shift ends (e.g., shifts ending at 08:00-09:00)
    const endOfDay = new Date(endOfDayChile(now).getTime() + 10 * 60 * 60 * 1000);

    // Show ALL pending/in-progress rounds for this installation today.
    // Any authenticated guard can take any round, regardless of assignment.
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        rondaTemplateId: { in: templates.map(t => t.id) },
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ["pendiente", "en_curso", "incompleta", "completada", "no_realizada", "cerrada_auto", "cerrada_admin"] },
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
          instrucciones: tc.checkpoint.instrucciones ?? null,
          qrCode: tc.checkpoint.qrCode,
          lat: tc.checkpoint.lat,
          lng: tc.checkpoint.lng,
          geoRadiusM: tc.checkpoint.geoRadiusM,
          verificationType: tc.checkpoint.verificationType,
          orderIndex: tc.orderIndex,
          isRequired: tc.isRequired,
          completed: ej.marcaciones.some(m => m.checkpointId === tc.checkpointId && m.status === "COMPLETED"),
          tasks: tc.checkpoint.tasks ?? [],
        })) ?? [],
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("[Portal Rondas] Mis rondas error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return NextResponse.json(
        { success: false, error: "La consulta tardó demasiado. Intente de nuevo." },
        { status: 504 },
      );
    }
    return NextResponse.json({ success: false, error: "Error al obtener rondas" }, { status: 500 });
  }
}
