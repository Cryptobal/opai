/**
 * POST /api/config/ai-models
 * Add a custom model to a provider.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

const createSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional().nullable(),
  costTier: z.enum(["low", "medium", "high"]).default("medium"),
});

export async function POST(request: NextRequest) {
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

    const { data, error } = await parseBody(request, createSchema);
    if (error) return error;

    const provider = await prisma.aiProvider.findFirst({
      where: { id: data.providerId, tenantId: ctx.tenantId },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const model = await prisma.aiModel.create({
      data: {
        providerId: data.providerId,
        modelId: data.modelId,
        displayName: data.displayName,
        description: data.description ?? null,
        costTier: data.costTier,
        isDefault: false,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: model }, { status: 201 });
  } catch (err) {
    console.error("[ai-models] POST error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al crear modelo" },
      { status: 500 }
    );
  }
}
