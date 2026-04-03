import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/* ── GET /api/portal/guardia/results ─────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const totalAssigned = await prisma.examAssignment.count({
      where: { guardId: guardAuth.guardiaId },
    });

    const completedAssignments = await prisma.examAssignment.findMany({
      where: { guardId: guardAuth.guardiaId, status: "completed" },
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
