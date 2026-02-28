/**
 * API Route: /api/config/ai-models/[id]/default
 * PUT — Set a model as the default for AI generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { clearAiConfigCache } from "@/lib/ai-service";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const model = await prisma.aiModel.findUnique({
      where: { id },
      include: { provider: true },
    });

    if (!model) {
      return NextResponse.json(
        { success: false, error: "Modelo no encontrado" },
        { status: 404 },
      );
    }

    if (!model.provider.isActive) {
      return NextResponse.json(
        { success: false, error: "Activa el proveedor antes de seleccionar un modelo" },
        { status: 400 },
      );
    }

    // Remove default from all models, then set this one
    await prisma.$transaction([
      prisma.aiModel.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      prisma.aiModel.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    clearAiConfigCache();

    return NextResponse.json({
      success: true,
      data: {
        modelId: model.modelId,
        displayName: model.displayName,
        providerName: model.provider.name,
      },
    });
  } catch (error) {
    console.error("Error setting default AI model:", error);
    return NextResponse.json(
      { success: false, error: "Error al configurar modelo" },
      { status: 500 },
    );
  }
}
