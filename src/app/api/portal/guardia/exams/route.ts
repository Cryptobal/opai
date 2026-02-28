/**
 * API Route: /api/portal/guardia/exams
 * GET - List exams (pending + completed) for the guard
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
          select: {
            id: true,
            title: true,
            type: true,
            _count: { select: { questions: true } },
          },
        },
      },
      orderBy: { sentAt: "desc" },
    });

    // Mark expired assignments (> 30 days without completion)
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const data = assignments.map((a) => {
      let status = a.status;
      if (
        (status === "sent" || status === "opened") &&
        now.getTime() - a.sentAt.getTime() > thirtyDaysMs
      ) {
        status = "expired";
      }

      return {
        assignmentId: a.id,
        examId: a.exam.id,
        examTitle: a.exam.title,
        examType: a.exam.type,
        questionCount: a.exam._count.questions,
        status,
        sentAt: a.sentAt.toISOString(),
        completedAt: a.completedAt?.toISOString() ?? null,
        score: a.score ? Number(a.score) : null,
        attemptNumber: a.attemptNumber,
      };
    });

    const pending = data.filter((d) => d.status === "sent" || d.status === "opened");
    const completed = data.filter((d) => d.status === "completed");

    return NextResponse.json({
      success: true,
      data: { pending, completed, all: data },
    });
  } catch (error) {
    console.error("[PORTAL][GUARD] Error fetching exams:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener exámenes" },
      { status: 500 },
    );
  }
}
