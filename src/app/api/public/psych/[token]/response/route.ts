/**
 * POST /api/public/psych/[token]/response
 * Body: { itemId, value, latencyMs }
 * Upsert idempotente en (assessmentId, itemId). Acepta latencias menores al
 * min, pero la marca como flag-able (detectFastLatency lo usa al scoring).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { loadPublicAssessment } from "@/lib/psych/public-guard";

interface Ctx {
  params: Promise<{ token: string }>;
}

const BodySchema = z.object({
  itemId: z.string().min(10),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.any())]),
  latencyMs: z.number().int().min(0).max(1_200_000).nullable().optional(),
});

const WRITABLE_STATUSES = new Set(["PENDING", "STARTED"]);

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const g = await loadPublicAssessment(token);
  if (!g.ok) return g.response;

  if (!WRITABLE_STATUSES.has(g.assessment.status)) {
    return NextResponse.json(
      { success: false, error: "Evaluación ya finalizada" },
      { status: 409 },
    );
  }

  const parsed = await parseBody(req, BodySchema);
  if (parsed.error) return parsed.error;

  const item = await prisma.psychItem.findFirst({
    where: { id: parsed.data.itemId, versionId: g.assessment.versionId },
    select: { id: true, order: true },
  });
  if (!item) {
    return NextResponse.json(
      { success: false, error: "Item no pertenece a esta evaluación" },
      { status: 400 },
    );
  }

  await prisma.psychResponse.upsert({
    where: {
      assessmentId_itemId: {
        assessmentId: g.assessment.id,
        itemId: item.id,
      },
    },
    create: {
      assessmentId: g.assessment.id,
      itemId: item.id,
      itemOrder: item.order,
      value: parsed.data.value as never,
      latencyMs: parsed.data.latencyMs ?? null,
    },
    update: {
      value: parsed.data.value as never,
      latencyMs: parsed.data.latencyMs ?? null,
      answeredAt: new Date(),
    },
  });

  // Si la evaluación estaba PENDING, subirla a STARTED al primer response.
  if (g.assessment.status === "PENDING") {
    await prisma.psychAssessment.update({
      where: { id: g.assessment.id },
      data: { status: "STARTED", startedAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}
