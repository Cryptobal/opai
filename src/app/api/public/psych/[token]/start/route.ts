/**
 * POST /api/public/psych/[token]/start — marca status=STARTED la primera vez.
 * Idempotente: si ya estaba STARTED o posterior, retorna ok sin cambios.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadPublicAssessment } from "@/lib/psych/public-guard";

interface Ctx {
  params: Promise<{ token: string }>;
}

const TERMINAL = new Set(["SUBMITTED", "SCORED", "REVIEWED", "EXPIRED"]);

export async function POST(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const g = await loadPublicAssessment(token);
  if (!g.ok) return g.response;

  if (TERMINAL.has(g.assessment.status)) {
    return NextResponse.json(
      { success: false, error: "Evaluación ya finalizada" },
      { status: 409 },
    );
  }

  if (g.assessment.status !== "PENDING") {
    return NextResponse.json({ success: true, alreadyStarted: true });
  }

  await prisma.psychAssessment.update({
    where: { id: g.assessment.id },
    data: { status: "STARTED", startedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
