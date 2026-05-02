import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { decryptApiKey, encryptApiKey, maskApiKey } from "@/lib/ai-encryption";

function safeMask(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return maskApiKey(decryptApiKey(encrypted));
  } catch {
    return "••••••••(error)";
  }
}

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const providers = await prisma.tenantAiProvider.findMany({
    where: { tenantId: ctx.tenantId },
    include: { models: { orderBy: { costTier: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  const masked = providers.map((p) => ({
    ...p,
    apiKey: undefined,
    apiKeyMasked: safeMask(p.apiKey),
    hasApiKey: !!p.apiKey,
  }));

  return NextResponse.json({ success: true, data: masked });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const body = await request.json();
  const { providerType, name, baseUrl, apiKey } = body as {
    providerType?: string;
    name?: string;
    baseUrl?: string | null;
    apiKey?: string;
  };

  if (!providerType || !name) {
    return NextResponse.json(
      { success: false, error: "providerType y name son requeridos" },
      { status: 400 },
    );
  }

  const provider = await prisma.tenantAiProvider.create({
    data: {
      tenantId: ctx.tenantId,
      providerType,
      name,
      baseUrl: baseUrl ?? null,
      apiKey: apiKey ? encryptApiKey(apiKey) : null,
      isActive: false,
    },
  });

  return NextResponse.json({ success: true, data: { id: provider.id } });
}
