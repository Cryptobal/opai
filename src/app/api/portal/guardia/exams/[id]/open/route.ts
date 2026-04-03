import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

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

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, guardId: guardAuth.guardiaId },
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
