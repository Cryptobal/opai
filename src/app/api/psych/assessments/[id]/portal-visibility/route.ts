/**
 * PATCH /api/psych/assessments/[id]/portal-visibility
 *
 * Toggle `portalVisible` en el PsychResult asociado al assessment indicado.
 * Se controla desde la vista de revisión del resultado en backoffice.
 *
 * IMPORTANTE: el flag SOLO controla si el cliente ve la **banda** + fecha en
 * el portal del cliente. El score numérico, dimensiones, alerts, openAnalysis
 * y lieScale JAMÁS se exponen al cliente (ver guardias/[id]/route.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

const Body = z.object({ portalVisible: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, Body);
    if ("error" in parsed) return parsed.error;

    const { id: assessmentId } = await params;

    const assessment = await prisma.psychAssessment.findFirst({
      where: { id: assessmentId, tenantId: ctx.tenantId },
      select: { id: true, result: { select: { id: true } } },
    });

    if (!assessment || !assessment.result) {
      return NextResponse.json(
        { success: false, error: "Resultado no encontrado" },
        { status: 404 },
      );
    }

    const updated = await prisma.psychResult.update({
      where: { id: assessment.result.id },
      data: { portalVisible: parsed.data.portalVisible },
      select: { id: true, portalVisible: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[psych/.../portal-visibility] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
