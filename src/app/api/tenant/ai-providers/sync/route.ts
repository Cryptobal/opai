import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const stats = { added: 0, updated: 0, providers: 0 };

  for (const kp of KNOWN_PROVIDERS) {
    let provider = await prisma.tenantAiProvider.findFirst({
      where: { tenantId: ctx.tenantId, providerType: kp.providerType },
      include: { models: true },
    });

    if (!provider) {
      provider = await prisma.tenantAiProvider.create({
        data: {
          tenantId: ctx.tenantId,
          providerType: kp.providerType,
          name: kp.name,
          baseUrl: kp.defaultBaseUrl,
          isActive: false,
        },
        include: { models: true },
      });
      stats.providers++;
    }

    const existingModelIds = new Set(provider.models.map((m) => m.modelId));

    for (const km of kp.models) {
      if (!existingModelIds.has(km.modelId)) {
        await prisma.tenantAiModel.create({
          data: {
            providerId: provider.id,
            modelId: km.modelId,
            displayName: km.displayName,
            description: km.description,
            costTier: km.costTier,
            isDefault: km.recommended ?? false,
            isActive: true,
          },
        });
        stats.added++;
      } else {
        const existing = provider.models.find((m) => m.modelId === km.modelId);
        if (
          existing &&
          (existing.displayName !== km.displayName ||
            existing.costTier !== km.costTier ||
            existing.description !== km.description)
        ) {
          await prisma.tenantAiModel.update({
            where: { id: existing.id },
            data: {
              displayName: km.displayName,
              description: km.description,
              costTier: km.costTier,
            },
          });
          stats.updated++;
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Sync completado: ${stats.added} modelos nuevos, ${stats.updated} actualizados, ${stats.providers} proveedores nuevos`,
    stats,
  });
}
