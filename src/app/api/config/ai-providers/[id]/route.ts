/**
 * PUT /api/config/ai-providers/:id
 * Save/update API key, base URL, and activate/deactivate a provider.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  parseBody,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { encryptApiKey } from "@/lib/ai-encryption";

const updateSchema = z.object({
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(
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
    const { data, error } = await parseBody(request, updateSchema);
    if (error) return error;

    const provider = await prisma.aiProvider.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (data.apiKey !== undefined) {
      updateData.apiKey = encryptApiKey(data.apiKey);
    }

    if (data.baseUrl !== undefined) {
      updateData.baseUrl = data.baseUrl;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;

      if (data.isActive) {
        await prisma.aiProvider.updateMany({
          where: { tenantId: ctx.tenantId, id: { not: id } },
          data: { isActive: false },
        });
      }
    }

    const updated = await prisma.aiProvider.update({
      where: { id },
      data: updateData,
      include: { models: { orderBy: { costTier: "asc" } } },
    });

    return NextResponse.json({
      success: true,
      data: { ...updated, apiKey: undefined, hasApiKey: !!updated.apiKey },
    });
  } catch (err) {
    console.error("[ai-providers] PUT error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno al actualizar proveedor" },
      { status: 500 }
    );
  }
}
