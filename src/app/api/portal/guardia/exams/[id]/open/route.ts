import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/* ── POST /api/portal/guardia/exams/[id]/open ────────────────── */

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

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, guardId: guardiaId },
      select: { id: true, status: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (assignment.status === "sent") {
      const updated = await prisma.examAssignment.update({
        where: { id: assignmentId },
        data: { status: "opened", openedAt: new Date() },
        select: { id: true, status: true, openedAt: true },
      });

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          openedAt: updated.openedAt?.toISOString() ?? null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: assignment.id,
        status: assignment.status,
        message: "El examen ya fue abierto previamente",
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Exam open POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al abrir examen" },
      { status: 500 },
    );
  }
}
