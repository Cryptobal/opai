/**
 * POST /api/public/psych/[token]/submit — marca SUBMITTED y dispara scoring
 * en background (fire-and-forget). Si ya estaba SUBMITTED/SCORED, idempotente.
 *
 * Valida que exista al menos una respuesta para cada item requerido; si faltan,
 * retorna 400 con la lista para que el wizard vuelva a pedirlas.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPublicAssessment } from "@/lib/psych/public-guard";
import { logAudit } from "@/lib/audit";
import { scoreAssessment } from "@/lib/psych/scoring";

interface Ctx {
  params: Promise<{ token: string }>;
}

const DONE = new Set(["SUBMITTED", "SCORED", "REVIEWED"]);

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const g = await loadPublicAssessment(token);
  if (!g.ok) return g.response;

  if (DONE.has(g.assessment.status)) {
    return NextResponse.json({
      success: true,
      alreadySubmitted: true,
      thanksPage: "/t/psicotest/thanks",
    });
  }

  const [items, responses] = await Promise.all([
    prisma.psychItem.findMany({
      where: { versionId: g.assessment.versionId },
      select: { id: true, order: true },
    }),
    prisma.psychResponse.findMany({
      where: { assessmentId: g.assessment.id },
      select: { itemId: true },
    }),
  ]);
  const answered = new Set(responses.map((r) => r.itemId));
  const missing = items.filter((i) => !answered.has(i.id));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Faltan ${missing.length} respuestas`,
        missingOrders: missing.map((m) => m.order).sort((a, b) => a - b),
      },
      { status: 400 },
    );
  }

  await prisma.psychAssessment.update({
    where: { id: g.assessment.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });

  await logAudit({
    action: "UPDATE",
    entity: "psych_assessment",
    entityId: g.assessment.id,
    tenantId: g.assessment.tenantId,
    details: { operation: "submitted_by_target" },
    request: req,
  });

  // Fire-and-forget — no bloqueamos la respuesta al guardia.
  scoreAssessment(g.assessment.id).catch((err) => {
    console.error("[psych/submit] scoring failed:", err);
  });

  return NextResponse.json({
    success: true,
    thanksPage: "/t/psicotest/thanks",
  });
}
