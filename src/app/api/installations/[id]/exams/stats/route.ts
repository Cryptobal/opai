import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { id: string };

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
        { success: false, error: "Sin permisos para ver estadísticas" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const [activeExams, assignments, totalGuards] = await Promise.all([
      prisma.exam.count({
        where: { installationId: id, status: "active" },
      }),
      prisma.examAssignment.findMany({
        where: { exam: { installationId: id } },
        select: { guardId: true, score: true, status: true },
      }),
      prisma.opsAsignacionGuardia.count({
        where: { installationId: id, isActive: true },
      }),
    ]);

    const uniqueGuardIds = new Set(
      assignments.filter((a) => a.status === "completed").map((a) => a.guardId),
    );
    const evaluatedGuards = uniqueGuardIds.size;

    const scores = assignments
      .filter((a) => a.status === "completed" && a.score !== null)
      .map((a) => a.score as number);

    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    const lowPerformanceCount = scores.filter((s) => s < 60).length;

    return NextResponse.json({
      success: true,
      data: {
        activeExams,
        totalGuards,
        evaluatedGuards,
        avgScore,
        lowPerformanceCount,
      },
    });
  } catch (error) {
    console.error("[EXAMS] Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las estadísticas" },
      { status: 500 },
    );
  }
}
