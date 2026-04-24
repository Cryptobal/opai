/**
 * GET /api/psych/dashboard — métricas agregadas para el home del módulo:
 * - Conteos por banda (FIT/FIT_CAUTION/NOT_RECOMMENDED) y por status.
 * - Score promedio global (solo assessments con resultado).
 * - Últimas 10 evaluaciones con resultado.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPsych } from "@/lib/psych/api-guard";

export async function GET() {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.ctx;

  const [byStatus, byBand, avg, recent] = await Promise.all([
    prisma.psychAssessment.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.psychResult.groupBy({
      by: ["band"],
      where: { assessment: { tenantId } },
      _count: { _all: true },
    }),
    prisma.psychResult.aggregate({
      where: { assessment: { tenantId } },
      _avg: { globalScore: true },
    }),
    prisma.psychAssessment.findMany({
      where: { tenantId, result: { isNot: null } },
      orderBy: { scoredAt: "desc" },
      take: 10,
      select: {
        id: true,
        targetName: true,
        targetRut: true,
        status: true,
        scoredAt: true,
        result: {
          select: { globalScore: true, band: true },
        },
      },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) statusCounts[r.status] = r._count._all;
  const bandCounts: Record<string, number> = {};
  for (const r of byBand) bandCounts[r.band] = r._count._all;

  return NextResponse.json({
    success: true,
    metrics: {
      statusCounts,
      bandCounts,
      averageScore: avg._avg.globalScore ?? 0,
    },
    recent,
  });
}
