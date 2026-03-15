import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const schema = z.object({
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  tenantId: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos invalidos" }, { status: 400 });
    }

    const { guardiaId, installationId, tenantId, deviceInfo } = parsed.data;

    // Validate guard belongs to tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Fetch active checkpoints for the installation
    const installationCheckpoints = await prisma.opsCheckpoint.findMany({
      where: { tenantId, installationId, isActive: true },
      select: {
        id: true,
        name: true,
        instrucciones: true,
        qrCode: true,
        lat: true,
        lng: true,
        geoRadiusM: true,
        verificationType: true,
        sortOrder: true,
        isCritical: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    // ── Block free rounds when scheduled rounds are pending ("listas" / "con_retraso") ──
    const now = new Date();
    const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);

    const pendingScheduled = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        installationId,
        status: "pendiente",
        programacionId: { not: null },
        scheduledAt: { gte: windowStart, lte: windowEnd },
      },
      include: { programacion: { select: { toleranciaMinutos: true } } },
    });

    const blockingRounds = pendingScheduled.filter((r) => {
      const elapsedMin = (now.getTime() - r.scheduledAt.getTime()) / 60000;
      const tolerance = r.programacion?.toleranciaMinutos ?? 30;
      return elapsedMin >= -15 && elapsedMin <= tolerance;
    });

    if (blockingRounds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Tienes ${blockingRounds.length} ronda${blockingRounds.length !== 1 ? "s" : ""} programada${blockingRounds.length !== 1 ? "s" : ""} pendiente${blockingRounds.length !== 1 ? "s" : ""}. Completa tus rondas programadas primero.`,
        },
        { status: 400 },
      );
    }

    // If an ad-hoc ronda is already en_curso, return it so the frontend can resume
    const existing = await prisma.opsRondaEjecucion.findFirst({
      where: {
        guardiaId,
        tenantId,
        isAdHoc: true,
        status: "en_curso",
      },
    });
    if (existing) {
      // Fetch existing marcaciones to know which checkpoints are already completed
      const marcaciones = await prisma.opsMarcacion.findMany({
        where: { ejecucionId: existing.id, status: "COMPLETED" },
        select: { checkpointId: true },
      });
      const completedIds = new Set(marcaciones.map(m => m.checkpointId));

      return NextResponse.json({
        success: true,
        data: {
          ejecucionId: existing.id,
          status: existing.status,
          startedAt: existing.startedAt?.toISOString(),
          checkpointsTotal: installationCheckpoints.length,
          resumed: true,
          checkpoints: installationCheckpoints.map((cp, idx) => ({
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
            completed: completedIds.has(cp.id),
            tasks: [],
          })),
        },
      });
    }

    const ejecucion = await prisma.opsRondaEjecucion.create({
      data: {
        tenantId,
        guardiaId,
        installationId,
        isAdHoc: true,
        rondaTemplateId: null,
        programacionId: null,
        status: "en_curso",
        scheduledAt: now,
        startedAt: now,
        checkpointsTotal: installationCheckpoints.length,
        checkpointsCompletados: 0,
        deviceInfo: deviceInfo as any,
      },
    });

    // Notify monitoreo desktop in real-time
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${tenantId}`, "ronda-started", {
        ejecucionId: ejecucion.id,
        guardiaId,
        installationId,
        isAdHoc: true,
      });
    } catch (pusherErr) {
      console.error("[INICIAR_LIBRE] Pusher trigger failed:", pusherErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        ejecucionId: ejecucion.id,
        status: ejecucion.status,
        startedAt: ejecucion.startedAt?.toISOString(),
        checkpointsTotal: installationCheckpoints.length,
        checkpoints: installationCheckpoints.map((cp, idx) => ({
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
          completed: false,
          tasks: [],
        })),
      },
    });
  } catch (error) {
    console.error("[PORTAL_RONDAS_INICIAR_LIBRE]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
