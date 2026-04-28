import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { decryptApiKey } from "@/lib/ai-encryption";
import { AIService, type AIConfig } from "@/lib/ai-service";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  let body: { modelId?: string; apiKey?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const provider = await prisma.tenantAiProvider.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { models: { where: { isActive: true }, orderBy: { costTier: "asc" } } },
  });

  if (!provider) {
    return NextResponse.json(
      { success: false, error: "No encontrado" },
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
      { success: false, error: "Sin API key" },
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
}
