/**
 * POST /api/config/ai-providers/:id/test
 * Tests connection to the provider by sending a simple prompt.
 * Expects { modelId?: string } in the body (optional — uses default if omitted).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { decryptApiKey } from "@/lib/ai-encryption";
import { getDefaultBaseUrlForProvider } from "@/lib/ai-known-models";
import { AIService, type AIConfig } from "@/lib/ai-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    let body: { modelId?: string; apiKey?: string } = {};
    try {
      body = await request.json();
    } catch {
      // body is optional
    }

    const provider = await prisma.aiProvider.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { models: { where: { isActive: true }, orderBy: { costTier: "asc" } } },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const apiKeyPlain = body.apiKey
      ? body.apiKey
      : provider.apiKey
        ? decryptApiKey(provider.apiKey)
        : null;

    if (!apiKeyPlain) {
      return NextResponse.json(
        { success: false, error: "No hay API key configurada" },
        { status: 400 }
      );
    }

    const modelId =
      body.modelId ??
      provider.models.find((m) => m.isDefault)?.modelId ??
      provider.models[0]?.modelId;

    if (!modelId) {
      return NextResponse.json(
        { success: false, error: "No hay modelos disponibles" },
        { status: 400 }
      );
    }

    const resolvedBase =
      (provider.baseUrl && provider.baseUrl.trim()) ||
      getDefaultBaseUrlForProvider(provider.providerType);

    const testConfig: AIConfig = {
      providerType: provider.providerType,
      modelId,
      apiKey: apiKeyPlain,
      baseUrl: resolvedBase,
    };

    const service = new AIService();
    const result = await service.testConnection(testConfig);

    if (result.ok) {
      return NextResponse.json({ success: true, message: "Conexión exitosa" });
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  } catch (err) {
    console.error("[ai-providers] test error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al probar conexión" },
      { status: 500 }
    );
  }
}
