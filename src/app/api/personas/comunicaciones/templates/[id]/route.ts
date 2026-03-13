import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  asunto: z.string().min(1).optional(),
  tipo: z.enum(["ONBOARDING", "BIENVENIDA_SITIO", "RECORDATORIO", "GENERAL"]).optional(),
  contenido: z.any().optional(),
  variables: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
  esDefault: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, props: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
  if (forbidden) return forbidden;

  const { id } = await props.params;

  const template = await prisma.opsEmailTemplate.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Plantilla no encontrada" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: template });
}

export async function PATCH(request: NextRequest, props: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
  if (forbidden) return forbidden;

  const { id } = await props.params;

  const existing = await prisma.opsEmailTemplate.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Plantilla no encontrada" },
      { status: 404 },
    );
  }

  const parsed = await parseBody(request, updateSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.esDefault) {
    const tipo = body.tipo ?? existing.tipo;
    await prisma.opsEmailTemplate.updateMany({
      where: { tenantId: ctx.tenantId, tipo, esDefault: true, id: { not: id } },
      data: { esDefault: false },
    });
  }

  const template = await prisma.opsEmailTemplate.update({
    where: { id },
    data: body,
  });

  return NextResponse.json({ success: true, data: template });
}

export async function DELETE(_request: NextRequest, props: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
  if (forbidden) return forbidden;

  const { id } = await props.params;

  const existing = await prisma.opsEmailTemplate.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { envios: true } } },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Plantilla no encontrada" },
      { status: 404 },
    );
  }

  if (existing._count.envios > 0) {
    await prisma.opsEmailTemplate.update({
      where: { id },
      data: { activo: false },
    });
    return NextResponse.json({
      success: true,
      data: { softDeleted: true },
      message: "Plantilla desactivada (tiene envíos asociados)",
    });
  }

  await prisma.opsEmailTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true, data: { deleted: true } });
}
