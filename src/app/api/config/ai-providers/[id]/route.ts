/**
 * API Route: /api/config/ai-providers/[id]
 * PUT — Update an AI provider (API key, activation status, base URL).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { encrypt } from "@/lib/encryption";
import { clearAiConfigCache } from "@/lib/ai-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "manage_settings")) {
      return NextResponse.json({ success: false, error: "Sin permisos para gestionar configuración de IA" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      apiKey?: string;
      isActive?: boolean;
      baseUrl?: string | null;
    };

    const provider = await prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.apiKey !== undefined) {
      // Encrypt the API key before storing
      updateData.apiKey = body.apiKey ? encrypt(body.apiKey) : null;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;

      // If activating and no API key exists, reject
      if (body.isActive && !provider.apiKey && !body.apiKey) {
        return NextResponse.json(
          { success: false, error: "Configura una API key antes de activar el proveedor" },
          { status: 400 },
        );
      }
    }

    if (body.baseUrl !== undefined) {
      updateData.baseUrl = body.baseUrl;
    }

    const updated = await prisma.aiProvider.update({
      where: { id },
      data: updateData,
    });

    // Clear the config cache so next AI call picks up the new settings
    clearAiConfigCache();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        providerType: updated.providerType,
        isActive: updated.isActive,
        hasApiKey: !!updated.apiKey,
      },
    });
  } catch (error) {
    console.error("Error updating AI provider:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar proveedor" },
      { status: 500 },
    );
  }
}
