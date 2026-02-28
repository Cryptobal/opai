/**
 * API Route: /api/ops/exams/stats
 * GET - Returns exam statistics for an installation (4 stat cards)
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    // Get all exams for this installation
    const exams = await prisma.opsExam.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { id: true, status: true },
    });

    const activeExams = exams.filter((e) => e.status === "active").length;
    const examIds = exams.map((e) => e.id);

    // Get all assignments for these exams
    const assignments = await prisma.opsExamAssignment.findMany({
      where: { examId: { in: examIds }, tenantId: ctx.tenantId },
      select: {
        guardId: true,
        status: true,
        score: true,
      },
    });

    // Unique guards who have assignments
    const guardsWithAssignments = new Set(assignments.map((a) => a.guardId));

    // Count of guards assigned to this installation
    const totalGuards = await prisma.opsAsignacionGuardia.count({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
    });

    // Completed assignments
    const completed = assignments.filter((a) => a.status === "completed");
    const pending = assignments.filter((a) => a.status === "sent" || a.status === "opened");

    // Average score
    const scores = completed.map((a) => Number(a.score ?? 0));
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : 0;

    // Low performers (< 60%)
    const guardScores = new Map<string, number[]>();
    for (const a of completed) {
      const existing = guardScores.get(a.guardId) ?? [];
      existing.push(Number(a.score ?? 0));
      guardScores.set(a.guardId, existing);
    }

    let lowPerformers = 0;
    let lowestGuardId: string | null = null;
    let lowestAvg = 100;

    for (const [guardId, gScores] of guardScores) {
      const gAvg = gScores.reduce((sum, s) => sum + s, 0) / gScores.length;
      if (gAvg < 60) lowPerformers++;
      if (gAvg < lowestAvg) {
        lowestAvg = gAvg;
        lowestGuardId = guardId;
      }
    }

    // Get name of lowest performer
    let lowestGuardName: string | null = null;
    if (lowestGuardId) {
      const guard = await prisma.opsGuardia.findUnique({
        where: { id: lowestGuardId },
        include: { persona: { select: { firstName: true, lastName: true } } },
      });
      if (guard?.persona) {
        lowestGuardName = `${guard.persona.firstName} ${guard.persona.lastName}`.trim();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        activeExams,
        totalExams: exams.length,
        evaluatedGuards: guardsWithAssignments.size,
        totalGuards,
        pendingCount: pending.length,
        avgScore,
        completedCount: completed.length,
        lowPerformers,
        lowestGuardName,
        lowestAvg: Math.round(lowestAvg),
      },
    });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas" },
      { status: 500 },
    );
  }
}
