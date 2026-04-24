/**
 * GET /api/psych/assessments/[id] — detalle con result + responses.
 * DELETE /api/psych/assessments/[id] — HARD DELETE (solo admin) con razón.
 *
 * La eliminación borra en cascada assessment + responses + result + análisis
 * IA. Se registra audit log con evento psych.assessment.deleted e incluye
 * targetName y banda para trazabilidad post-delete.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";
import { parseBody } from "@/lib/api-auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

const DeleteSchema = z.object({
  reason: z.string().min(10, "Razón mínima 10 caracteres").max(500),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const a = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: guard.ctx.tenantId },
    include: {
      result: true,
      responses: { orderBy: { itemOrder: "asc" } },
      version: {
        select: { code: true, version: true, name: true, items: true },
      },
    },
  });
  if (!a) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, assessment: a });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("admin");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const ctx = guard.ctx;

  const parsed = await parseBody(req, DeleteSchema);
  if (parsed.error) return parsed.error;

  const existing = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      targetName: true,
      result: { select: { band: true } },
    },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Evaluación no encontrada" },
      { status: 404 },
    );
  }

  // Hard delete con cascade (responses y result tienen onDelete: Cascade).
  await prisma.psychAssessment.delete({ where: { id } });

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "DELETE",
    entity: "psych_assessment",
    entityId: id,
    details: {
      event: "psych.assessment.deleted",
      targetName: existing.targetName,
      band: existing.result?.band ?? null,
      reason: parsed.data.reason,
    },
    request: req,
  });

  return NextResponse.json({ success: true });
}
