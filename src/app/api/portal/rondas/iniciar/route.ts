import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/portal/rondas/iniciar
 *
 * Sets startedAt and status=en_curso when guard presses "Iniciar Ronda".
 * This ensures startedAt is recorded immediately, not on first checkpoint mark.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, lat, lng, deviceInfo } = body as {
      ejecucionId?: string;
      guardiaId?: string;
      lat?: number;
      lng?: number;
      deviceInfo?: Record<string, unknown>;
    };

    if (!ejecucionId || !UUID_RE.test(ejecucionId)) {
      return NextResponse.json(
        { success: false, error: "ejecucionId inv\u00E1lido" },
        { status: 400 },
      );
    }
    if (!guardiaId || !UUID_RE.test(guardiaId)) {
      return NextResponse.json(
        { success: false, error: "guardiaId inv\u00E1lido" },
        { status: 400 },
      );
    }

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        status: { in: ["pendiente", "incompleta"] },
      },
      select: {
        id: true,
        tenantId: true,
        guardiaId: true,
        installationId: true,
        isAdHoc: true,
        scheduledAt: true,
        programacionId: true,
        programacion: { select: { frecuenciaMinutos: true } },
      },
    });

    if (!execution) {
      return NextResponse.json(
        { success: false, error: "Ejecuci\u00F3n no encontrada o ya iniciada" },
        { status: 404 },
      );
    }

    // Block starting a new scheduled round if the same guard already has one en_curso
    // for the same installation (prevents overlapping programmed rounds)
    if (!execution.isAdHoc && execution.installationId) {
      const activeRound = await prisma.opsRondaEjecucion.findFirst({
        where: {
          guardiaId,
          installationId: execution.installationId,
          isAdHoc: false,
          status: "en_curso",
          id: { not: ejecucionId },
        },
        select: { id: true, scheduledAt: true },
      });

      if (activeRound) {
        return NextResponse.json(
          {
            success: false,
            error: "Tienes una ronda programada en curso. Complétala antes de iniciar la siguiente.",
          },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: "en_curso",
      startedAt: now,
      guardiaId,
    };

    if (deviceInfo) {
      updateData.deviceInfo = deviceInfo;
    }

    const updated = await prisma.opsRondaEjecucion.update({
      where: { id: ejecucionId },
      data: updateData,
      select: {
        id: true,
        status: true,
        startedAt: true,
        guardiaId: true,
        scheduledAt: true,
      },
    });

    // Fire-and-forget Pusher event
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${execution.tenantId}`, "ronda-started", {
        ejecucionId: updated.id,
        guardiaId: updated.guardiaId,
        startedAt: updated.startedAt,
      });
    } catch (pusherErr) {
      console.error("[INICIAR] Pusher trigger failed:", pusherErr);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Portal Rondas] iniciar error:", error);
    return NextResponse.json(
      { success: false, error: "Error al iniciar ronda" },
      { status: 500 },
    );
  }
}
