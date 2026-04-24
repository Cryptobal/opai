/**
 * PATCH /api/ops/guardias/[id]/supervision-evals/[evalId]/portal-visibility
 *
 * Toggle `portalVisible` en una evaluación de supervisión por guardia.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

const Body = z.object({ portalVisible: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; evalId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, Body);
    if ("error" in parsed) return parsed.error;

    const { id: guardiaId, evalId } = await params;

    const evaluation = await prisma.opsSupervisionGuardEvaluation.findFirst({
      where: {
        id: evalId,
        guardId: guardiaId,
        tenantId: ctx.tenantId,
      },
      select: { id: true },
    });

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: "Evaluación no encontrada" },
        { status: 404 },
      );
    }

    const updated = await prisma.opsSupervisionGuardEvaluation.update({
      where: { id: evalId },
      data: { portalVisible: parsed.data.portalVisible },
      select: { id: true, portalVisible: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(
      "[ops/guardias/.../portal-visibility] supervision eval error:",
      error,
    );
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
