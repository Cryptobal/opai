import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, props: RouteParams) {
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

  await prisma.$transaction([
    prisma.opsEmailTemplate.updateMany({
      where: { tenantId: ctx.tenantId, tipo: template.tipo, esDefault: true },
      data: { esDefault: false },
    }),
    prisma.opsEmailTemplate.update({
      where: { id },
      data: { esDefault: true },
    }),
  ]);

  return NextResponse.json({ success: true, data: { id, esDefault: true } });
}
