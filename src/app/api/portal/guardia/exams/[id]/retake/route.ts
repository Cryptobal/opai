import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/* ── POST /api/portal/guardia/exams/[id]/retake ─────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: assignmentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, guardId: guardiaId },
      select: { id: true, examId: true, guardId: true, attemptNumber: true, status: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (assignment.status !== "completed") {
      return NextResponse.json(
        { success: false, error: "Solo se puede reintentar un examen completado" },
        { status: 400 },
      );
    }

    const newAssignment = await prisma.examAssignment.create({
      data: {
        examId: assignment.examId,
        guardId: assignment.guardId,
        status: "opened",
        openedAt: new Date(),
        attemptNumber: assignment.attemptNumber + 1,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: { assignmentId: newAssignment.id },
    });
  } catch (error) {
    console.error("[Portal Guardia] Exam retake POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al reintentar examen" },
      { status: 500 },
    );
  }
}
