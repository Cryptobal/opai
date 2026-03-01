/**
 * GET /api/config/ai-providers
 * Lists all AI providers with their models. API keys are masked.
 *
 * POST /api/config/ai-providers
 * (reserved for future custom provider creation)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { decryptApiKey, maskApiKey } from "@/lib/ai-encryption";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const providers = await prisma.aiProvider.findMany({
      where: { tenantId: ctx.tenantId },
      include: { models: { orderBy: { costTier: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    const masked = providers.map((p) => ({
      ...p,
      apiKey: undefined,
      apiKeyMasked: p.apiKey ? maskApiKey(decryptApiKey(p.apiKey)) : null,
      hasApiKey: !!p.apiKey,
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (err) {
    console.error("[ai-providers] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al cargar proveedores de IA" },
      { status: 500 }
    );
  }
}
