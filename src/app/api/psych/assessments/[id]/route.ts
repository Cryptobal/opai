/**
 * GET /api/psych/assessments/[id] — detalle con result + responses.
 * DELETE /api/psych/assessments/[id] — soft delete (marca EXPIRED) si no submitted.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { guardPsych } from "@/lib/psych/api-guard";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const a = await prisma.psychAssessment.findFirst({
    where: { id, tenantId: guard.ctx.tenantId },
    include: {
      result: true,
      responses: {
        orderBy: { itemOrder: "asc" },
      },
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
  if (existing.status === "SUBMITTED" || existing.status === "SCORED" || existing.status === "REVIEWED") {
    return NextResponse.json(
      {
        success: false,
        error: "No se puede eliminar una evaluación ya enviada. Usa el flujo de revisión.",
      },
      { status: 400 },
    );
  }

  await prisma.psychAssessment.update({
    where: { id },
    data: { status: "EXPIRED" },
  });

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "DELETE",
    entity: "psych_assessment",
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
