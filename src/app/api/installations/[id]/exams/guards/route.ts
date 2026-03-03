import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";

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
        { success: false, error: "Sin permisos para ver guardias" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const guards = await prisma.opsGuardia.findMany({
      where: {
        OR: [
          { currentInstallationId: id },
          {
            asignaciones: {
              some: { installationId: id, isActive: true },
            },
          },
        ],
      },
      include: {
        persona: { select: { firstName: true, lastName: true } },
        examAssignments: {
          where: { exam: { installationId: id } },
          include: { exam: { select: { title: true } } },
          orderBy: { sentAt: "desc" },
        },
      },
    });

    const data = guards
      .map((guard) => {
        const assignments = guard.examAssignments;
        const completed = assignments.filter((a) => a.status === "completed");
        const scores = completed
          .map((a) => a.score)
          .filter((s): s is number => s !== null);

        const avgScore = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null;

        const lastExamDate = completed.length > 0
          ? completed[0].completedAt
          : null;

        const pendingCount = assignments.filter(
          (a) => a.status === "sent" || a.status === "opened",
        ).length;

        let trend: "up" | "down" | "stable" | null = null;
        if (scores.length >= 2) {
          const diff = scores[0] - scores[1];
          trend = diff > 0 ? "up" : diff < 0 ? "down" : "stable";
        }

        return {
          guardId: guard.id,
          name: formatPersonName(guard.persona.firstName, guard.persona.lastName),
          completedCount: completed.length,
          avgScore,
          lastExamDate,
          pendingCount,
          trend,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[EXAMS] Error fetching guards overview:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el resumen de guardias" },
      { status: 500 },
    );
  }
}
