/**
 * GET /api/config/ai-providers/:id/key
 * Returns the decrypted API key. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { decryptApiKey } from "@/lib/ai-encryption";

export async function GET(
  _request: NextRequest,
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

    const provider = await prisma.aiProvider.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    if (!provider.apiKey) {
      return NextResponse.json(
        { success: false, error: "No hay API key configurada" },
        { status: 404 }
      );
    }

    const plainKey = decryptApiKey(provider.apiKey);

    return NextResponse.json({ success: true, apiKey: plainKey });
  } catch (err) {
    console.error("[ai-providers] key reveal error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener API key" },
      { status: 500 }
    );
  }
}
