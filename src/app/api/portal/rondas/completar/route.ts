import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateRondaTrustScore } from "@/lib/rondas/trust-score-v2";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, notes } = body as {
      ejecucionId?: string;
      guardiaId?: string;
      notes?: string | null;
    };

    if (!ejecucionId || !guardiaId) {
      return NextResponse.json(
        { success: false, error: "ejecucionId y guardiaId son requeridos" },
        { status: 400 },
      );
    }

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        status: { in: ["pendiente", "en_curso", "incompleta"] },
      },
      include: {
        rondaTemplate: {
          include: {
            checkpoints: { orderBy: { orderIndex: "asc" } },
          },
        },
        programacion: { select: { toleranciaMinutos: true } },
        marcaciones: { orderBy: { timestamp: "asc" } },
      },
    });

    if (!execution) {
      return NextResponse.json(
        { success: false, error: "Ejecución no encontrada" },
        { status: 404 },
      );
    }

    // Validate guardiaId matches — also handles null guardiaId case
    const effectiveGuardiaId = execution.guardiaId ?? guardiaId;
    if (!effectiveGuardiaId) {
      return NextResponse.json(
        { success: false, error: "No se pudo determinar el guardia" },
        { status: 400 },
      );
    }
    if (execution.guardiaId && execution.guardiaId !== guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId no coincide con la ejecución" },
        { status: 403 },
      );
    }

    const now = new Date();
    const templateCps = execution.rondaTemplate.checkpoints;
    const total = templateCps.length;
    const markedCpIds = new Set(
      execution.marcaciones.map((m) => m.checkpointId),
    );

    const missedData = templateCps
      .filter((tc) => !markedCpIds.has(tc.checkpointId))
      .map((tc) => ({
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

    const allMarcaciones = [
      ...execution.marcaciones,
      ...missedData.map((d) => ({
        ...d,
        anomalias: null,
        batteryLevel: null,
        motionData: null,
        speedFromPrevKmh: null,
        timeFromPrevSec: null,
        fotoEvidenciaUrl: null,
        audioUrl: null,
        note: null,
        createdAt: now,
        id: "",
      })),
    ];

    const completedCount = execution.marcaciones.filter(
      (m) => m.status === "COMPLETED" || !m.status,
    ).length;
    const missedPercent =
      total > 0 ? (missedData.length / total) * 100 : 0;
    const status = missedPercent > 20 ? "incompleta" : "completada";
    const pct = total > 0 ? (completedCount / total) * 100 : 0;

    const durationMinutes = execution.startedAt
      ? Math.round(
          (now.getTime() - new Date(execution.startedAt).getTime()) / 60000,
        )
      : null;

    const trustResult = calculateRondaTrustScore({
      ejecucion: { ...execution, completedAt: now, checkpointsTotal: total },
      marcaciones: allMarcaciones.map((m) => ({
        status: (m as any).status ?? "COMPLETED",
        timestamp: m.timestamp,
        checkpointId: m.checkpointId,
      })),
      template: execution.rondaTemplate,
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
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        trustScore: trustResult.score,
        trustBreakdown: trustResult.breakdown,
        porcentajeCompletado: pct,
        durationMinutes,
        missed: missedData.length,
      },
    });
  } catch (error) {
    console.error("[Portal Rondas] Completar error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
