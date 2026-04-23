import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";
import { broadcastToPortalCliente } from "@/lib/rondas/realtime-portal-cliente";
import { getChileDayOfWeek, parseChileHour } from "@/lib/rondas/timezone";

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

    // ── Block free rounds during active programación windows ──
    const now = new Date();
    const todayDow = getChileDayOfWeek(now);

    // Get all active programaciones for this installation's templates
    const activeTemplateIds = await prisma.opsRondaTemplate.findMany({
      where: { tenantId, installationId, isActive: true },
      select: { id: true },
    });
    const templateIds = activeTemplateIds.map((t) => t.id);

    if (templateIds.length > 0) {
      const programaciones = await prisma.opsRondaProgramacion.findMany({
        where: {
          rondaTemplateId: { in: templateIds },
          isActive: true,
        },
        select: {
          id: true,
          diasSemana: true,
          horaInicio: true,
          horaFin: true,
          toleranciaMinutos: true,
        },
      });

      // Check if "now" falls inside any programación window (horaInicio → horaFin)
      for (const prog of programaciones) {
        const dias = (prog.diasSemana as number[]) ?? [];
        if (!dias.includes(todayDow)) continue;

        const windowStart = parseChileHour(prog.horaInicio, now);
        let windowEnd = parseChileHour(prog.horaFin, now);
        // Handle overnight windows (e.g., 22:00 → 06:00)
        if (windowEnd <= windowStart) {
          windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
        }
        // Add tolerance to window end so last round can be completed
        const tolerance = prog.toleranciaMinutos ?? 10;
        const windowEndWithTolerance = new Date(windowEnd.getTime() + tolerance * 60 * 1000);

        if (now >= windowStart && now <= windowEndWithTolerance) {
          return NextResponse.json(
            {
              success: false,
              error: "No puedes iniciar una ronda libre durante el horario de rondas programadas. Espera a que termine la ventana de programación.",
            },
            { status: 400 },
          );
        }
      }

      // Also check yesterday's overnight windows that extend into today
      const yesterdayDow = (todayDow + 6) % 7;
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      for (const prog of programaciones) {
        const dias = (prog.diasSemana as number[]) ?? [];
        if (!dias.includes(yesterdayDow)) continue;

        const windowStart = parseChileHour(prog.horaInicio, yesterday);
        let windowEnd = parseChileHour(prog.horaFin, yesterday);
        if (windowEnd <= windowStart) {
          windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
        }
        const tolerance = prog.toleranciaMinutos ?? 10;
        const windowEndWithTolerance = new Date(windowEnd.getTime() + tolerance * 60 * 1000);

        // Only relevant if the overnight window extends past midnight into today
        if (windowEnd > windowStart && now >= windowStart && now <= windowEndWithTolerance) {
          return NextResponse.json(
            {
              success: false,
              error: "No puedes iniciar una ronda libre durante el horario de rondas programadas. Espera a que termine la ventana de programación.",
            },
            { status: 400 },
          );
        }
      }
    }

    // ── Block free rounds when a scheduled round is already en_curso (any guard) ──
    const scheduledEnCurso = await prisma.opsRondaEjecucion.findFirst({
      where: {
        tenantId,
        installationId,
        isAdHoc: false,
        status: "en_curso",
      },
      select: { id: true },
    });

    if (scheduledEnCurso) {
      return NextResponse.json(
        {
          success: false,
          error: "Hay una ronda programada en curso en esta instalación. Espera a que se complete antes de iniciar una ronda libre.",
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
      const marcaciones = await prisma.opsMarcacionCheckpoint.findMany({
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

    // Notify monitoreo desktop in real-time (+ portal cliente del accountId)
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${tenantId}`, "ronda-started", {
        ejecucionId: ejecucion.id,
        guardiaId,
        installationId,
        isAdHoc: true,
      });
      await broadcastToPortalCliente({
        event: "ronda-started",
        ejecucionId: ejecucion.id,
        installationId,
        payload: { isAdHoc: true },
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
