import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { encryptApiKey } from "@/lib/ai-encryption";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const { id } = await params;
    const body = await request.json();

    const provider = await prisma.platformAiProvider.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (typeof body.apiKey === "string" && body.apiKey) {
      updateData.apiKey = encryptApiKey(body.apiKey);
    }

    if (body.baseUrl !== undefined) {
      updateData.baseUrl = body.baseUrl || null;
    }

    if (typeof body.isActive === "boolean") {
      updateData.isActive = body.isActive;
      if (body.isActive) {
        await prisma.platformAiProvider.updateMany({
          where: { id: { not: id } },
          data: { isActive: false },
        });
      }
    }

    const updated = await prisma.platformAiProvider.update({
      where: { id },
      data: updateData,
      include: { models: { orderBy: { costTier: "asc" } } },
    });

    return NextResponse.json({
      success: true,
      data: { ...updated, apiKey: undefined, hasApiKey: !!updated.apiKey },
    });
  } catch (err) {
    console.error("[platform/ai-providers] PUT error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al actualizar proveedor" },
      { status: 500 },
    );
  }
}
