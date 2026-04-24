/**
 * PATCH /api/ops/guardias/[id]/exam-assignments/[assignmentId]/portal-visibility
 *
 * Toggle `portalVisible` en un ExamAssignment. Solo admin del tenant dueño
 * del guardia puede operar.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

const Body = z.object({ portalVisible: z.boolean() });

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; assignmentId: string }>;
  },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, Body);
    if ("error" in parsed) return parsed.error;

    const { id: guardiaId, assignmentId } = await params;

    const assignment = await prisma.examAssignment.findFirst({
      where: {
        id: assignmentId,
        guardId: guardiaId,
        guard: { tenantId: ctx.tenantId },
      },
      select: { id: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Asignación no encontrada" },
        { status: 404 },
      );
    }

    const updated = await prisma.examAssignment.update({
      where: { id: assignmentId },
      data: { portalVisible: parsed.data.portalVisible },
      select: { id: true, portalVisible: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(
      "[ops/guardias/.../portal-visibility] exam assignment error:",
      error,
    );
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
