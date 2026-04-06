import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export async function POST() {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const stats = { added: 0, updated: 0, providers: 0 };

    for (const kp of KNOWN_PROVIDERS) {
      let provider = await prisma.platformAiProvider.findFirst({
        where: { providerType: kp.providerType },
        include: { models: true },
      });

      if (!provider) {
        provider = await prisma.platformAiProvider.create({
          data: {
            name: kp.name,
            providerType: kp.providerType,
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
          await prisma.platformAiModel.create({
            data: {
              providerId: provider.id,
              modelId: km.modelId,
              displayName: km.displayName,
              description: km.description,
              costTier: km.costTier,
              isDefault: false,
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
            await prisma.platformAiModel.update({
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
  } catch (err) {
    console.error("[platform/ai-providers] sync error:", err);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar modelos" },
      { status: 500 },
    );
  }
}
