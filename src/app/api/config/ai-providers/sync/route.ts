/**
 * POST /api/config/ai-providers/sync
 *
 * Syncs the known models catalog with the database.
 * Adds new models that don't exist yet. Updates display names and
 * cost tiers for existing ones. Never deletes user-added custom models.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export async function POST() {
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

    const stats = { added: 0, updated: 0, providers: 0 };

    for (const kp of KNOWN_PROVIDERS) {
      let provider = await prisma.aiProvider.findFirst({
        where: { providerType: kp.providerType, tenantId: ctx.tenantId },
        include: { models: true },
      });

      if (!provider) {
        provider = await prisma.aiProvider.create({
          data: {
            tenantId: ctx.tenantId,
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
          await prisma.aiModel.create({
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
            await prisma.aiModel.update({
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
    console.error("[ai-providers] sync error:", err);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar modelos" },
      { status: 500 }
    );
  }
}
