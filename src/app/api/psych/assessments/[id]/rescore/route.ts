/**
 * POST /api/psych/assessments/[id]/rescore — re-ejecuta scoring (útil tras
 * cambiar pesos/umbrales del tenant). Solo permitido si assessment está en
 * SUBMITTED, SCORED o REVIEWED.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { scoreAssessment } from "@/lib/psych/scoring";

interface Ctx {
  params: Promise<{ id: string }>;
}

const RESCORE_STATES = new Set(["SUBMITTED", "SCORED", "REVIEWED"]);

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const ctx = guard.ctx;

  const existing = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }
  if (!RESCORE_STATES.has(existing.status)) {
    return NextResponse.json(
      { success: false, error: "La evaluación aún no ha sido enviada" },
      { status: 400 },
    );
  }

  const result = await scoreAssessment(id);

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "psych_result",
    entityId: result.id,
    details: { operation: "rescore" },
    request: req,
  });

  return NextResponse.json({ success: true, result });
}
