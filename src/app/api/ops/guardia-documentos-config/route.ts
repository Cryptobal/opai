/**
 * API: /api/ops/guardia-documentos-config
 * GET  - Obtener configuración de documentos de ficha de guardia
 * POST - Guardar configuración
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  getGuardiaDocumentosConfig,
  setGuardiaDocumentosConfig,
  type GuardiaDocumentoConfigItem,
} from "@/lib/guardia-documentos-config";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const items = await getGuardiaDocumentosConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[guardia-documentos-config] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const items = body?.items;
    if (!Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: "Se requiere items[]" },
        { status: 400 }
      );
    }

    const valid: GuardiaDocumentoConfigItem[] = items
      .filter(
        (i: unknown): i is GuardiaDocumentoConfigItem =>
          typeof i === "object" &&
          i !== null &&
          typeof (i as GuardiaDocumentoConfigItem).code === "string"
      )
      .map((i) => ({
        code: String(i.code),
        hasExpiration: Boolean(i.hasExpiration),
        alertDaysBefore: Math.max(1, Math.min(365, Number(i.alertDaysBefore) || 30)),
      }));

    const saved = await setGuardiaDocumentosConfig(valid, ctx.tenantId);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error("[guardia-documentos-config] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar configuración" },
      { status: 500 }
    );
  }
}
