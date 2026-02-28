/**
 * API Route: /api/portal/guardia/results
 * GET - Guard's exam results history with stats
 *
 * Query: ?guardiaId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 401 },
      );
    }

    const assignments = await prisma.opsExamAssignment.findMany({
      where: { guardId: guardiaId },
      include: {
        exam: {
          select: { title: true, type: true },
        },
      },
      orderBy: { sentAt: "desc" },
    });

    const completed = assignments.filter((a) => a.status === "completed");
    const scores = completed.map((a) => Number(a.score ?? 0));
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : null;

    // Trend
    let trend: "up" | "stable" | "down" = "stable";
    if (scores.length >= 2) {
      if (scores[0] > scores[1] + 5) trend = "up";
      else if (scores[0] < scores[1] - 5) trend = "down";
    }

    const results = assignments.map((a) => ({
      assignmentId: a.id,
      examTitle: a.exam.title,
      examType: a.exam.type,
      status: a.status,
      score: a.score ? Number(a.score) : null,
      completedAt: a.completedAt?.toISOString() ?? null,
      sentAt: a.sentAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          avgScore,
          completedCount: completed.length,
          totalAssigned: assignments.length,
          trend,
        },
        results,
      },
    });
  } catch (error) {
    console.error("[PORTAL][GUARD] Error fetching results:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener resultados" },
      { status: 500 },
    );
  }
}
