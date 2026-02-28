/**
 * API Route: /api/config/ai-providers/test
 * POST — Test connection to an AI provider with given credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";
import { testAiConnection } from "@/lib/ai-service";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "manage_settings")) {
      return NextResponse.json({ success: false, error: "Sin permisos para gestionar configuración de IA" }, { status: 403 });
    }

    const body = (await request.json()) as {
      providerType: string;
      modelId: string;
      apiKey: string;
      baseUrl?: string;
    };

    if (!body.providerType || !body.modelId || !body.apiKey) {
      return NextResponse.json(
        { success: false, error: "providerType, modelId y apiKey son requeridos" },
        { status: 400 },
      );
    }

    // If "__use_stored__" is passed, fetch the encrypted key from the DB
    let apiKey = body.apiKey;
    if (apiKey === "__use_stored__") {
      const provider = await prisma.aiProvider.findFirst({
        where: { providerType: body.providerType },
        select: { apiKey: true },
      });
      if (!provider?.apiKey) {
        return NextResponse.json(
          { success: false, error: "No hay API key almacenada para este proveedor" },
          { status: 400 },
        );
      }
      try {
        apiKey = decrypt(provider.apiKey);
      } catch {
        apiKey = provider.apiKey;
      }
    }

    const result = await testAiConnection(
      body.providerType,
      body.modelId,
      apiKey,
      body.baseUrl,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error testing AI connection:", error);
    return NextResponse.json(
      { success: false, error: "Error al probar conexión" },
      { status: 500 },
    );
  }
}
