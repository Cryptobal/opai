/**
 * GET /api/cron/psych-expire-assessments
 *
 * Cron job diario que marca como EXPIRED los assessments cuyo expiresAt
 * ya pasó y están en estado PENDING o STARTED (nunca submitted/scored).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Registrado en vercel.json con schedule "0 3 * * *" (diario 03:00 UTC).
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const before = await prisma.psychAssessment.findMany({
    where: {
      status: { in: ["PENDING", "STARTED"] },
      expiresAt: { lt: now },
    },
    select: { id: true, tenantId: true, targetName: true, expiresAt: true },
  });

  if (before.length === 0) {
    return NextResponse.json({ success: true, expired: 0 });
  }

  const result = await prisma.psychAssessment.updateMany({
    where: {
      id: { in: before.map((a) => a.id) },
      status: { in: ["PENDING", "STARTED"] },
    },
    data: { status: "EXPIRED" },
  });

  // Audit log batch — una sola entrada con detalles.
  await logAudit({
    action: "UPDATE",
    entity: "psych_assessment_batch",
    entityId: "expire-cron",
    details: {
      event: "psych.assessments.batch_expired",
      count: result.count,
      sampleIds: before.slice(0, 10).map((a) => a.id),
    },
  });

  return NextResponse.json({
    success: true,
    expired: result.count,
    now: now.toISOString(),
  });
}
