/**
 * API Route: /api/config/ai-providers
 * GET — List all AI providers with their models.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { maskApiKey } from "@/lib/encryption";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const providers = await prisma.aiProvider.findMany({
      include: {
        models: {
          orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    const data = providers.map((p: typeof providers[number]) => ({
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      hasApiKey: !!p.apiKey,
      maskedApiKey: p.apiKey ? maskApiKey(p.apiKey) : null,
      baseUrl: p.baseUrl,
      isActive: p.isActive,
      models: p.models.map((m: typeof p.models[number]) => ({
        id: m.id,
        modelId: m.modelId,
        displayName: m.displayName,
        description: m.description,
        isDefault: m.isDefault,
        costTier: m.costTier,
        isActive: m.isActive,
      })),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error listing AI providers:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener proveedores" },
      { status: 500 },
    );
  }
}
