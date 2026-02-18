import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearTenantEmailConfigCache } from "@/lib/resend";

const EMPRESA_KEYS = [
  "empresa.razonSocial",
  "empresa.rut",
  "empresa.direccion",
  "empresa.comuna",
  "empresa.ciudad",
  "empresa.telefono",
  "empresa.repLegalNombre",
  "empresa.repLegalRut",
  "empresa.emailFrom",
  "empresa.emailFromName",
  "empresa.emailReplyTo",
];

function settingKey(tenantId: string, key: string): string {
  return `empresa:${tenantId}:${key}`;
}

/**
 * GET /api/configuracion/empresa — Get company settings (por tenant)
 * Soporta keys nuevas (empresa:tenantId:empresa.xxx) y antiguas (empresa.xxx) para migración.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const newKeys = EMPRESA_KEYS.map((k) => settingKey(ctx.tenantId, k));
    let settings = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: newKeys } },
    });

    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId: ctx.tenantId, key: { in: EMPRESA_KEYS } },
      });
    }

    const data: Record<string, string> = {};
    for (const s of settings) {
      const shortKey = s.key.includes(":") ? s.key.replace(`empresa:${ctx.tenantId}:`, "") : s.key;
      data[shortKey] = s.value;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CONFIG] Error loading empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la configuración" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/configuracion/empresa — Update company settings (por tenant)
 * Body: { "empresa.razonSocial": "...", "empresa.emailFrom": "...", ... }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar esta configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    for (const shortKey of EMPRESA_KEYS) {
      if (body[shortKey] !== undefined) {
        const key = settingKey(ctx.tenantId, shortKey);
        await prisma.setting.upsert({
          where: { key },
          create: {
            key,
            value: String(body[shortKey]),
            type: "string",
            category: "empresa",
            tenantId: ctx.tenantId,
          },
          update: {
            value: String(body[shortKey]),
          },
        });
      }
    }

    clearTenantEmailConfigCache(ctx.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONFIG] Error updating empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 }
    );
  }
}
