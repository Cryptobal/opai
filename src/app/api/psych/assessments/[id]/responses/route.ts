/**
 * GET /api/psych/assessments/[id]/responses
 *
 * Retorna respuestas del evaluado unidas con la metadata del item (tipo,
 * dimensión, enunciado, scoringKey). Útil para el modal "Ver respuestas"
 * que permite revisar ítem por ítem.
 *
 * NO expone scoringKey del item sin necesidad — solo para rol admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPsych } from "@/lib/psych/api-guard";
import { normalizeResponse } from "@/lib/psych/scoring/normalize";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const a = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: guard.ctx.tenantId },
    select: {
      id: true,
      versionId: true,
      responses: {
        orderBy: { itemOrder: "asc" },
        select: {
          itemId: true,
          itemOrder: true,
          value: true,
          latencyMs: true,
          answeredAt: true,
        },
      },
      version: {
        select: {
          items: {
            select: {
              id: true,
              order: true,
              type: true,
              dimension: true,
              prompt: true,
              options: true,
              scoringKey: true,
              reverseScore: true,
              minLatencyMs: true,
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!a) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }

  const itemMap = new Map(a.version.items.map((i) => [i.id, i]));
  const rows = a.responses.map((r) => {
    const item = itemMap.get(r.itemId);
    if (!item) {
      return { ...r, item: null, normalizedScore: null, fastLatency: false };
    }
    let normalizedScore: number | null = null;
    if (item.type !== "OPEN") {
      normalizedScore = normalizeResponse(
        item.type as "LIKERT" | "SJT" | "COGNITIVE" | "LIE",
        r.value,
        item.scoringKey,
        item.reverseScore,
      );
    }
    const fastLatency =
      r.latencyMs !== null && r.latencyMs < item.minLatencyMs;
    return {
      itemId: r.itemId,
      itemOrder: r.itemOrder,
      value: r.value,
      latencyMs: r.latencyMs,
      answeredAt: r.answeredAt,
      item: {
        order: item.order,
        type: item.type,
        dimension: item.dimension,
        prompt: item.prompt,
        options: item.options,
      },
      normalizedScore,
      fastLatency,
    };
  });

  return NextResponse.json({ success: true, rows });
}
