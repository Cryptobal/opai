import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateRondaTrustScore } from "@/lib/rondas/trust-score-v2";
import { autoPopulateCNFromRonda } from "@/lib/rondas/auto-populate-grid";
import { getPusherServer } from "@/lib/chat";
import { broadcastToPortalCliente } from "@/lib/rondas/realtime-portal-cliente";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, notes, walkRoute, routeSnapshot } = body as {
      ejecucionId?: string;
      guardiaId?: string;
      notes?: string | null;
      walkRoute?: Array<{ lat: number; lng: number }>;
      routeSnapshot?: Array<{ id: string; name: string; lat: number; lng: number; orderIndex: number; status: string }>;
    };

    if (!ejecucionId || !guardiaId) {
      return NextResponse.json(
        { success: false, error: "ejecucionId y guardiaId son requeridos" },
        { status: 400 },
      );
    }

    // Resolve tenantId from the authenticated guard
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { tenantId: true },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }
    const tenantId = guardia.tenantId;

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        tenantId,
        status: { in: ["pendiente", "en_curso", "incompleta"] },
      },
      include: {
        rondaTemplate: {
          include: {
            checkpoints: { orderBy: { orderIndex: "asc" } },
          },
        },
        programacion: { select: { toleranciaMinutos: true } },
        marcaciones: {
          select: { id: true, checkpointId: true, timestamp: true, status: true },
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!execution) {
      return NextResponse.json(
        { success: false, error: "Ejecución no encontrada" },
        { status: 404 },
      );
    }

    // Resolve effective guardiaId: prefer the execution's original guard for audit,
    // but allow any guard at the same installation to complete the round.
    const effectiveGuardiaId = execution.guardiaId ?? guardiaId;
    if (!effectiveGuardiaId) {
      return NextResponse.json(
        { success: false, error: "No se pudo determinar el guardia" },
        { status: 400 },
      );
    }
    if (execution.guardiaId && execution.guardiaId !== guardiaId) {
      console.warn(
        `[COMPLETAR] guardiaId mismatch: request=${guardiaId}, execution=${execution.guardiaId}, ejecucionId=${ejecucionId}. Allowing completion.`,
      );
    }

    const now = new Date();
    const isAdHoc = !execution.rondaTemplateId;

    let missedData: any[] = [];
    let total: number;
    let templateCps: any[] = [];

    if (isAdHoc) {
      // Use the stored total (all active checkpoints at the installation when round started),
      // NOT marcaciones.length — which would always yield 100% since only completed marks exist.
      total = execution.checkpointsTotal || execution.marcaciones.length;
    } else {
      templateCps = execution.rondaTemplate!.checkpoints;
      total = templateCps.length;
      const markedCpIds = new Set(execution.marcaciones.map((m) => m.checkpointId));

      missedData = templateCps
        .filter((tc: any) => !markedCpIds.has(tc.checkpointId))
        .map((tc: any) => ({
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          checkpointId: tc.checkpointId,
          guardiaId: effectiveGuardiaId,
          timestamp: now,
          lat: 0,
          lng: 0,
          geoValidada: false,
          geoDistanciaM: null as number | null,
          hashIntegridad: "missed",
          status: "MISSED",
          verificationMethod: "MANUAL",
          isOfflineSync: false,
        }));

      if (missedData.length > 0) {
        await prisma.opsMarcacionCheckpoint.createMany({ data: missedData });
      }
    }

    const allMarcaciones = [
      ...execution.marcaciones,
      ...missedData.map((d) => ({
        id: "",
        checkpointId: d.checkpointId,
        timestamp: d.timestamp,
        status: d.status,
      })),
    ];

    const completedCount = execution.marcaciones.filter(
      (m) => m.status === "COMPLETED" || !m.status,
    ).length;
    // For ad-hoc rounds, missed = total checkpoints minus completed marks
    const missedCount = isAdHoc ? (total - completedCount) : missedData.length;
    const missedPercent = total > 0 ? (missedCount / total) * 100 : 0;
    const status = missedPercent > 20 ? "incompleta" : "completada";
    const pct = total > 0 ? (completedCount / total) * 100 : 0;

    const durationMinutes = execution.startedAt
      ? Math.round(
          (now.getTime() - new Date(execution.startedAt).getTime()) / 60000,
        )
      : null;

    const trustResult = isAdHoc
      ? { score: 0, breakdown: { applicable: false, reason: "ronda_libre" } as const }
      : calculateRondaTrustScore({
          ejecucion: { ...execution, completedAt: now, checkpointsTotal: total },
          marcaciones: allMarcaciones.map((m) => ({
            status: (m as any).status ?? "COMPLETED",
            timestamp: m.timestamp,
            checkpointId: m.checkpointId,
          })),
          template: execution.rondaTemplate!,
          templateCheckpoints: templateCps,
          programacion: execution.programacion,
        });

    const updated = await prisma.opsRondaEjecucion.update({
      where: { id: execution.id },
      data: {
        status,
        completedAt: now,
        checkpointsTotal: total,
        checkpointsCompletados: completedCount,
        porcentajeCompletado: pct,
        trustScore: trustResult.score,
        trustBreakdown: trustResult.breakdown as any,
        durationMinutes,
        notes: notes?.slice(0, 2000) ?? null,
        walkRoute: walkRoute ?? undefined,
        routeSnapshot: routeSnapshot ?? undefined,
      },
    });

    // Fire-and-forget Pusher event (monitoreo interno + portal cliente)
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${execution.tenantId}`, "ronda-completed", {
        ejecucionId: updated.id,
        status: updated.status,
        trustScore: trustResult.score,
        porcentajeCompletado: pct,
      });
    } catch (pusherErr) {
      console.error("[COMPLETAR] Pusher trigger failed:", pusherErr);
    }
    await broadcastToPortalCliente({
      event: "ronda-completed",
      ejecucionId: updated.id,
      installationId: execution.rondaTemplate?.installationId ?? execution.installationId ?? null,
      payload: {
        status: updated.status,
        trustScore: trustResult.score,
        porcentajeCompletado: pct,
      },
    });

    // Auto-populate CN grid in background — don't block the response
    const instId = execution.rondaTemplate?.installationId ?? execution.installationId;
    if (instId) {
      autoPopulateCNFromRonda({
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        installationId: instId,
        completedAt: now,
        trustScore: trustResult.score,
        status,
      }).catch((err) => console.error("[COMPLETAR] CN auto-populate failed:", err));
    }

    // Build per-checkpoint detail for the completion screen
    let checkpointDetails: any[];

    if (isAdHoc) {
      const marcaciones = await prisma.opsMarcacionCheckpoint.findMany({
        where: { ejecucionId },
        select: {
          id: true,
          timestamp: true,
          status: true,
          geoDistanciaM: true,
          geoValidada: true,
          verificationMethod: true,
          fotoEvidenciaUrl: true,
          checkpointId: true,
          checkpoint: { select: { id: true, name: true } },
        },
        orderBy: { timestamp: "asc" },
      });
      checkpointDetails = marcaciones.map((m: any, i: number) => ({
        name: m.checkpoint?.name ?? `Punto GPS #${i + 1}`,
        status: m.status ?? "COMPLETED",
        timestamp: m.timestamp?.toISOString(),
        distanceM: m.geoDistanciaM,
        geoValidada: m.geoValidada ?? false,
        qrScanned: m.verificationMethod === "QR" || m.verificationMethod === "BOTH",
        hasPhoto: !!m.fotoEvidenciaUrl,
      }));
    } else {
      const templateCheckpointsForDetail = await prisma.opsRondaCheckpoint.findMany({
        where: { rondaTemplateId: execution.rondaTemplateId! },
        include: { checkpoint: { select: { id: true, name: true } } },
        orderBy: { orderIndex: "asc" },
      });

      const allMarcacionesForDetail = await prisma.opsMarcacionCheckpoint.findMany({
        where: { ejecucionId },
        select: {
          checkpointId: true,
          timestamp: true,
          geoDistanciaM: true,
          geoValidada: true,
          verificationMethod: true,
          fotoEvidenciaUrl: true,
          status: true,
        },
      });

      checkpointDetails = templateCheckpointsForDetail.map((tc: any) => {
        const marc = allMarcacionesForDetail.find(
          (m) => m.checkpointId === tc.checkpointId && m.status === "COMPLETED",
        );
        return {
          name: tc.checkpoint.name,
          status: marc ? ("COMPLETED" as const) : ("MISSED" as const),
          timestamp: marc?.timestamp?.toISOString() ?? undefined,
          distanceM: marc?.geoDistanciaM ?? undefined,
          geoValidada: marc?.geoValidada ?? false,
          qrScanned: marc?.verificationMethod === "QR" || marc?.verificationMethod === "BOTH",
          hasPhoto: !!marc?.fotoEvidenciaUrl,
        };
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        trustScore: trustResult.score,
        trustBreakdown: trustResult.breakdown,
        trustApplicable: !isAdHoc,
        porcentajeCompletado: pct,
        durationMinutes,
        missed: missedCount,
        checkpoints: checkpointDetails,
        scheduledAt: execution.scheduledAt.toISOString(),
        startedAt: execution.startedAt?.toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Portal Rondas] Completar error:", msg, error);
    return NextResponse.json(
      { success: false, error: `Error al completar: ${msg.slice(0, 200)}` },
      { status: 500 },
    );
  }
}
