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
import { notifyGuardOfExam } from "@/lib/protocols/notify-guard-exam";

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

    const assignments = await prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        data.guardIds.map((guardId) =>
          tx.examAssignment.create({
            data: {
              examId,
              guardId,
              status: "sent",
            },
          }),
        ),
      );

      if (exam.status === "draft") {
        await tx.exam.update({
          where: { id: examId },
          data: { status: "active" },
        });
      }

      return created;
    });

    // Fire-and-forget notifications. Never block the response.
    if (exam.installation?.tenantId) {
      const tenantId = exam.installation.tenantId;
      for (const a of assignments) {
        void notifyGuardOfExam({
          examId,
          examTitle: exam.title,
          guardId: a.guardId,
          tenantId,
          assignmentId: a.id,
          trigger: "manual",
        });
      }
    }

    return NextResponse.json(
      { success: true, data: { assignments, count: assignments.length } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[EXAMS] Error sending exam:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el examen" },
      { status: 500 },
    );
  }
}
