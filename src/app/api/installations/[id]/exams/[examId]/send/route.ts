import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { getKnowledgeConfig } from "@/lib/knowledge/config";
import { createAssignmentAndNotify } from "@/lib/knowledge/dispatch-helpers";

type Params = { id: string; examId: string };

const sendSchema = z.object({
  guardIds: z.array(z.string().min(1)).min(1, "Selecciona al menos un guardia"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para enviar exámenes" },
        { status: 403 },
      );
    }

    const { examId } = await params;
    const { data, error } = await parseBody(request, sendSchema);
    if (error) return error;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        _count: { select: { questions: true } },
        installation: { select: { tenantId: true } },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (exam._count.questions === 0) {
      return NextResponse.json(
        { success: false, error: "El examen no tiene preguntas" },
        { status: 400 },
      );
    }

    const tenantId = exam.installation?.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Examen sin tenant asociado" },
        { status: 400 },
      );
    }

    const cfg = await getKnowledgeConfig(tenantId);

    // attemptNumber real por guardia: último + 1 (no hardcoded 1)
    const lastAttempts = await prisma.examAssignment.groupBy({
      by: ["guardId"],
      where: { examId, guardId: { in: data.guardIds } },
      _max: { attemptNumber: true },
    });
    const lastByGuard = new Map(
      lastAttempts.map((row) => [row.guardId, row._max.attemptNumber ?? 0]),
    );

    const results = await Promise.all(
      data.guardIds.map((guardId) =>
        createAssignmentAndNotify({
          examId,
          examTitle: exam.title,
          guardId,
          tenantId,
          trigger: "manual",
          triggeredByUserId: ctx.userId,
          attemptNumber: (lastByGuard.get(guardId) ?? 0) + 1,
          deadlineDays: cfg.deadlineDays,
          emailEnabled: cfg.emailEnabled,
        }),
      ),
    );

    // Activar examen draft fuera del Promise.all (no necesita tx + es idempotente)
    if (exam.status === "draft") {
      await prisma.exam.update({
        where: { id: examId },
        data: { status: "active" },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          count: results.length,
          assignments: results.map((r) => ({
            assignmentId: r.assignmentId,
            emailStatus: r.emailStatus,
            ...(r.emailError ? { emailError: r.emailError } : {}),
          })),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[knowledge-recurring] send manual failed:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el examen" },
      { status: 500 },
    );
  }
}
