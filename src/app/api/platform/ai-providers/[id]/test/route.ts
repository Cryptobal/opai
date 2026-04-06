import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { decryptApiKey } from "@/lib/ai-encryption";
import { AIService, type AIConfig } from "@/lib/ai-service";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const { id } = await params;

    let body: { modelId?: string; apiKey?: string } = {};
    try {
      body = await request.json();
    } catch {
      // body is optional
    }

    const provider = await prisma.platformAiProvider.findUnique({
      where: { id },
      include: { models: { where: { isActive: true }, orderBy: { costTier: "asc" } } },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 },
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
        { status: 400 },
      );
    }

    const modelId =
      body.modelId ??
      provider.models.find((m) => m.isDefault)?.modelId ??
      provider.models[0]?.modelId;

    if (!modelId) {
      return NextResponse.json(
        { success: false, error: "No hay modelos disponibles" },
        { status: 400 },
      );
    }

    const fallbackUrl =
      KNOWN_PROVIDERS.find((kp) => kp.providerType === provider.providerType)
        ?.defaultBaseUrl ?? "";

    const testConfig: AIConfig = {
      providerType: provider.providerType,
      modelId,
      apiKey: apiKeyPlain,
      baseUrl: provider.baseUrl || fallbackUrl,
    };

    const service = new AIService();
    const result = await service.testConnection(testConfig);

    if (result.ok) {
      return NextResponse.json({ success: true, message: "Conexión exitosa" });
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  } catch (err) {
    console.error("[platform/ai-providers] test error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al probar conexión" },
      { status: 500 },
    );
  }
}
