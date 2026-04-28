import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: modelId } = await params;
  const body = await request.json().catch(() => ({}));
  const targetModelId = (body as { modelId?: string }).modelId || modelId;

  const model = await prisma.tenantAiModel.findFirst({
    where: { id: targetModelId, provider: { tenantId: ctx.tenantId } },
    include: { provider: true },
  });
  if (!model) {
    return NextResponse.json(
      { success: false, error: "No encontrado" },
      { status: 404 },
    );
  }

  await prisma.$transaction([
    prisma.tenantAiModel.updateMany({
      where: { providerId: model.providerId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.tenantAiModel.update({
      where: { id: model.id },
      data: { isDefault: true },
    }),
  ]);

  return NextResponse.json({ success: true });
}
