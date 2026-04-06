import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const { id: modelId } = await params;
    const body = await request.json().catch(() => ({}));
    const targetModelId = (body as { modelId?: string }).modelId || modelId;

    const model = await prisma.platformAiModel.findUnique({
      where: { id: targetModelId },
    });
    if (!model) {
      return NextResponse.json(
        { success: false, error: "Modelo no encontrado" },
        { status: 404 },
      );
    }

    await prisma.$transaction([
      prisma.platformAiModel.updateMany({
        where: { providerId: model.providerId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.platformAiModel.update({
        where: { id: targetModelId },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[platform/ai-providers] set-default-model error:", err);
    return NextResponse.json(
      { success: false, error: "Error al establecer modelo por defecto" },
      { status: 500 },
    );
  }
}
