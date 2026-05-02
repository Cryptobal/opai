import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/* ── GET /api/portal/guardia/exams ───────────────────────────── */

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

    const assignments = await prisma.examAssignment.findMany({
      where: { guardId: guardAuth.guardiaId },
      include: {
        exam: {
          select: {
            title: true,
            type: true,
            passingScore: true,
            _count: { select: { questions: true } },
          },
        },
      },
      orderBy: { sentAt: "desc" },
    });

    const pending = assignments
      .filter((a) => a.status === "sent" || a.status === "opened")
      .map((a) => ({
        id: a.id,
        examId: a.examId,
        title: a.exam.title,
        type: a.exam.type,
        questionCount: a.exam._count.questions,
        passingScore: a.exam.passingScore,
        status: a.status,
        sentAt: a.sentAt.toISOString(),
        openedAt: a.openedAt?.toISOString() ?? null,
        attemptNumber: a.attemptNumber,
        dueAt: a.dueAt?.toISOString() ?? null,
      }));

    const completed = assignments
      .filter((a) => a.status === "completed")
      .sort((a, b) => {
        const dateA = a.completedAt?.getTime() ?? 0;
        const dateB = b.completedAt?.getTime() ?? 0;
        return dateB - dateA;
      })
      .map((a) => ({
        id: a.id,
        examId: a.examId,
        title: a.exam.title,
        type: a.exam.type,
        questionCount: a.exam._count.questions,
        passingScore: a.exam.passingScore,
        status: a.status,
        score: a.score,
        completedAt: a.completedAt?.toISOString() ?? null,
        timeTakenSecs: a.timeTakenSecs,
        attemptNumber: a.attemptNumber,
      }));

    return NextResponse.json({
      success: true,
      data: { pending, completed },
    });
  } catch (error) {
    console.error("[Portal Guardia] Exams GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener exámenes" },
      { status: 500 },
    );
  }
}
