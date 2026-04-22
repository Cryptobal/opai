/**
 * API: /api/ops/marcacion/config
 * GET  - Obtener configuración de marcaciones del tenant
 * POST - Guardar configuración de marcaciones del tenant
 *
 * Almacenadas en la tabla Setting con key="marcacion_config:{tenantId}"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import {
  normalizeMarcacionConfig,
  parseMarcacionConfigValue,
} from "@/lib/ops-marcacion-config";

function settingKey(tenantId: string) {
  return `marcacion_config:${tenantId}`;
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    const config = parseMarcacionConfigValue(setting?.value);

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("Error fetching marcacion config:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración de marcaciones" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "config", "ops")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cambiar la configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Merge con existente
    const existing = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    const currentConfig = parseMarcacionConfigValue(existing?.value);
    const merged = normalizeMarcacionConfig({ ...currentConfig, ...body });
    const value = JSON.stringify(merged);

    if (existing) {
      await prisma.setting.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await prisma.setting.create({
        data: {
          key: settingKey(ctx.tenantId),
          value,
          type: "json",
          category: "marcacion",
          tenantId: ctx.tenantId,
        },
      });
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error saving marcacion config:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar configuración de marcaciones" },
      { status: 500 }
    );
  }
}
