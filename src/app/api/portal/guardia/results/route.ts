import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ── GET /api/portal/guardia/results ─────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const totalAssigned = await prisma.examAssignment.count({
      where: { guardId: guardiaId },
    });

    const completedAssignments = await prisma.examAssignment.findMany({
      where: { guardId: guardiaId, status: "completed" },
      include: {
        exam: {
          select: {
            title: true,
            type: true,
            passingScore: true,
          },
        },
      },
      orderBy: { completedAt: "asc" },
    });

    const totalCompleted = completedAssignments.length;
    const scores = completedAssignments
      .map((a) => a.score)
      .filter((s): s is number => s !== null);

    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : null;

    let trend: "improving" | "declining" | "stable" | null = null;
    if (scores.length >= 2) {
      const last = scores[scores.length - 1];
      const prev = scores[scores.length - 2];
      if (last > prev) trend = "improving";
      else if (last < prev) trend = "declining";
      else trend = "stable";
    }

    const history = completedAssignments.map((a) => ({
      id: a.id,
      examId: a.examId,
      title: a.exam.title,
      type: a.exam.type,
      score: a.score,
      passingScore: a.exam.passingScore,
      passed: a.score !== null && a.score >= a.exam.passingScore,
      completedAt: a.completedAt?.toISOString() ?? null,
      timeTakenSecs: a.timeTakenSecs,
      attemptNumber: a.attemptNumber,
    }));

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalAssigned,
          totalCompleted,
          avgScore,
          trend,
        },
        history,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Results GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener resultados" },
      { status: 500 },
    );
  }
}
