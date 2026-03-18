import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile } from "@/lib/rondas/timezone";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth();
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { tenantId } = session;

    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    const installationId = request.nextUrl.searchParams.get("installationId");

    if (!guardiaId || !installationId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    if (!UUID_RE.test(guardiaId) || !UUID_RE.test(installationId)) {
      return NextResponse.json(
        { success: false, error: "Formato de parámetros inválido" },
        { status: 400 },
      );
    }

    if (!session.installationIds.includes(installationId)) {
      return NextResponse.json({ success: false, error: "Sin acceso a esta instalación" }, { status: 403 });
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
    // Include both template-based rondas AND ad-hoc rondas.
    // Programadas: rondaTemplateId in templates (templates already scoped to this installation).
    // Ad-hoc: must have isAdHoc + installationId (programadas have installationId=null from cron).
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ["pendiente", "en_curso", "incompleta", "completada", "no_realizada", "cerrada_auto", "cerrada_admin"] },
        OR: [
          { rondaTemplateId: { in: templates.map(t => t.id) } },
          { isAdHoc: true, installationId },
        ],
      },
      include: {
        marcaciones: {
          select: { checkpointId: true, status: true, timestamp: true },
        },
        programacion: { select: { toleranciaMinutos: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Fetch installation checkpoints for ad-hoc rondas
    let installationCheckpoints: {
      id: string; name: string; instrucciones: string | null; qrCode: string;
      lat: number | null; lng: number | null; geoRadiusM: number; verificationType: string;
      sortOrder: number; isCritical: boolean;
    }[] = [];
    const hasAdHoc = ejecuciones.some(ej => ej.isAdHoc);
    if (hasAdHoc) {
      installationCheckpoints = await prisma.opsCheckpoint.findMany({
        where: { tenantId, installationId, isActive: true },
        select: {
          id: true, name: true, instrucciones: true, qrCode: true,
          lat: true, lng: true, geoRadiusM: true, verificationType: true,
          sortOrder: true, isCritical: true,
        },
        orderBy: { sortOrder: "asc" },
      });
    }

    const result = ejecuciones.map(ej => {
      const template = templates.find(t => t.id === ej.rondaTemplateId);
      const isAdHoc = ej.isAdHoc;

      // For ad-hoc rondas, use installation checkpoints instead of template checkpoints
      const checkpoints = isAdHoc
        ? installationCheckpoints.map((cp, idx) => ({
            id: cp.id,
            name: cp.name,
            instrucciones: cp.instrucciones ?? null,
            qrCode: cp.qrCode,
            lat: cp.lat ?? 0,
            lng: cp.lng ?? 0,
            geoRadiusM: cp.geoRadiusM,
            verificationType: cp.verificationType,
            orderIndex: idx,
            isRequired: cp.isCritical,
            completed: ej.marcaciones.some(m => m.checkpointId === cp.id && m.status === "COMPLETED"),
            tasks: [] as { id: string; label: string; type: string; required: boolean; options?: string[] | null; config: unknown; sortOrder: number }[],
          }))
        : (template?.checkpoints.map(tc => ({
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
          })) ?? []);

      return {
        ejecucionId: ej.id,
        templateId: ej.rondaTemplateId,
        templateName: isAdHoc ? "Ronda Libre" : (template?.name ?? "Ronda"),
        status: ej.status,
        scheduledAt: ej.scheduledAt.toISOString(),
        startedAt: ej.startedAt?.toISOString() ?? null,
        checkpointsTotal: ej.checkpointsTotal,
        checkpointsCompletados: ej.checkpointsCompletados,
        qrRequerido: isAdHoc ? false : (template?.qrRequerido ?? false),
        orderMode: isAdHoc ? "flexible" : (template?.orderMode ?? "flexible"),
        estimatedDurationMin: isAdHoc ? null : (template?.estimatedDurationMin ?? null),
        toleranciaMinutos: ej.programacion?.toleranciaMinutos ?? 10,
        trustScore: ej.trustScore,
        porcentajeCompletado: ej.porcentajeCompletado,
        checkpoints,
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
