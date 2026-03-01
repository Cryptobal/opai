import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { id: string; guardId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver historial de guardia" },
        { status: 403 },
      );
    }

    const { id, guardId } = await params;

    const guard = await prisma.opsGuardia.findUnique({
      where: { id: guardId },
      include: { persona: { select: { firstName: true, lastName: true } } },
    });

    if (!guard) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const assignments = await prisma.examAssignment.findMany({
      where: {
        guardId,
        exam: { installationId: id },
      },
      include: {
        exam: { select: { title: true, type: true, passingScore: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    const history = assignments.map((a) => ({
      assignmentId: a.id,
      examTitle: a.exam.title,
      examType: a.exam.type,
      passingScore: a.exam.passingScore,
      status: a.status,
      sentAt: a.sentAt,
      completedAt: a.completedAt,
      score: a.score,
      passed: a.score !== null ? a.score >= a.exam.passingScore : null,
      timeTakenSecs: a.timeTakenSecs,
      attemptNumber: a.attemptNumber,
    }));

    const completedScores = history
      .filter((h) => h.score !== null)
      .map((h) => h.score as number);

    return NextResponse.json({
      success: true,
      data: {
        guard: {
          id: guard.id,
          name: `${guard.persona.firstName} ${guard.persona.lastName}`,
        },
        history,
        summary: {
          totalAssignments: history.length,
          completedCount: history.filter((h) => h.status === "completed").length,
          pendingCount: history.filter((h) => h.status === "sent" || h.status === "opened").length,
          avgScore: completedScores.length > 0
            ? Math.round(
                (completedScores.reduce((a, b) => a + b, 0) / completedScores.length) * 10,
              ) / 10
            : null,
          passRate: completedScores.length > 0
            ? Math.round(
                (history.filter((h) => h.passed === true).length / completedScores.length) * 100,
              )
            : null,
        },
      },
    });
  } catch (error) {
    console.error("[EXAMS] Error fetching guard history:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el historial del guardia" },
      { status: 500 },
    );
  }
}
