import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { rondaCompleteSchema } from "@/lib/validations/rondas";
import { computeRondaTrustScore } from "@/lib/rondas/trust-score";
import { calculateRondaTrustScore } from "@/lib/rondas/trust-score-v2";
import { autoPopulateCNFromRonda } from "@/lib/rondas/auto-populate-grid";

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/completar — ${new Date().toISOString()}`);
    const parsed = await parseBody(request, rondaCompleteSchema);
    if (parsed.error) return parsed.error;

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: { id: parsed.data.executionId, status: { in: ["pendiente", "en_curso", "incompleta"] } },
      include: {
        rondaTemplate: { include: { checkpoints: { orderBy: { orderIndex: "asc" } } } },
        programacion: { select: { toleranciaMinutos: true } },
        marcaciones: {
          select: { id: true, checkpointId: true, timestamp: true, status: true },
          orderBy: { timestamp: "asc" },
        },
      },
    });
    if (!execution) return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });

    const now = new Date();
    const templateCps = execution.rondaTemplate?.checkpoints ?? [];
    const total = templateCps.length;
    // Set de checkpoints que YA tienen fila (cualquier status: COMPLETED o
    // GEO_NO_VERIFICADA). No se debe insertar MISSED si ya existe fila —
    // violaría el unique constraint (ejecucionId, checkpointId).
    const existingRowCpIds = new Set(execution.marcaciones.map(m => m.checkpointId));

    const missedData = templateCps
      .filter(tc => !existingRowCpIds.has(tc.checkpointId))
      .map(tc => ({
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        checkpointId: tc.checkpointId,
        guardiaId: execution.guardiaId!,
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

    const allMarcaciones = [...execution.marcaciones, ...missedData.map(d => ({
      id: "",
      checkpointId: d.checkpointId,
      timestamp: d.timestamp,
      status: d.status,
    }))];

    const completedCount = execution.marcaciones.filter(m => m.status === "COMPLETED" || !m.status).length;
    // missed = todo lo que no se completó (MISSED reales + GEO_NO_VERIFICADA).
    // Derivar de total - completedCount mantiene el estado de la ejecución
    // idéntico al comportamiento previo al fix.
    const missedCount = Math.max(0, total - completedCount);
    const missedPercent = total > 0 ? (missedCount / total) * 100 : 0;
    const status = missedPercent > 20 ? "incompleta" : "completada";
    const pct = total > 0 ? (completedCount / total) * 100 : 0;

    const durationMinutes = execution.startedAt
      ? Math.round((now.getTime() - new Date(execution.startedAt).getTime()) / 60000)
      : null;

    const trustResult = calculateRondaTrustScore({
      ejecucion: { ...execution, completedAt: now, checkpointsTotal: total },
      marcaciones: allMarcaciones.map(m => ({
        status: (m as any).status ?? "COMPLETED",
        timestamp: m.timestamp,
        checkpointId: m.checkpointId,
      })),
      template: execution.rondaTemplate ?? { orderMode: "flexible", estimatedDurationMin: null },
      templateCheckpoints: templateCps,
      programacion: execution.programacion ?? undefined,
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
        notes: parsed.data.notes ?? null,
      },
    });

    // Auto-populate CN grid in background (same as portal endpoint)
    const instId = execution.rondaTemplate?.installationId ?? execution.installationId;
    if (instId) {
      autoPopulateCNFromRonda({
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        installationId: instId,
        completedAt: now,
        trustScore: trustResult.score,
        status,
      }).catch((err) => console.error("[public/completar] CN auto-populate failed:", err));
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        trustScore: trustResult.score,
        trustBreakdown: trustResult.breakdown,
        porcentajeCompletado: pct,
        durationMinutes,
        missed: missedCount,
      },
    });
  } catch (error) {
    console.error("[RONDAS] public completar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
