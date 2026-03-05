/**
 * API: /api/notifications/config
 * GET  - Obtener preferencias de notificación del tenant
 * POST - Guardar preferencias de notificación del tenant
 *
 * Almacenadas en la tabla Setting con key="notification_preferences:{tenantId}"
 * como JSON: { docExpiryDaysDefault: number, pushGlobalConfig: Record<key, { pushEnabled: boolean }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { PORTAL_NOTIFICATION_TYPES } from "@/lib/pwa/portal-notification-types";

function settingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

/** Default: all notification types push-enabled = true (using defaultPush from type definition) */
function defaultPushGlobalConfig(): Record<string, { pushEnabled: boolean }> {
  return Object.fromEntries(
    PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, { pushEnabled: t.defaultPush }])
  );
}

const BASE_DEFAULTS = { docExpiryDaysDefault: 30 };

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    let prefs = { ...BASE_DEFAULTS, pushGlobalConfig: defaultPushGlobalConfig() };
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        prefs = {
          ...BASE_DEFAULTS,
          ...parsed,
          pushGlobalConfig: parsed.pushGlobalConfig ?? defaultPushGlobalConfig(),
        };
      } catch {
        // corrupted JSON — return defaults
      }
    }

    return NextResponse.json({ success: true, data: prefs });
  } catch (error) {
    console.error("Error fetching notification config:", error);
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

    if (!hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cambiar la configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const docExpiryDays =
      typeof body.docExpiryDaysDefault === "number"
        ? Math.max(1, Math.min(365, body.docExpiryDaysDefault))
        : 30;

    // Sanitize pushGlobalConfig: only allow known keys with boolean values
    const validKeys = new Set(PORTAL_NOTIFICATION_TYPES.map((t) => t.key));
    const rawPushConfig = body.pushGlobalConfig ?? {};
    const pushGlobalConfig: Record<string, { pushEnabled: boolean }> = {};
    for (const key of validKeys) {
      const val = rawPushConfig[key];
      pushGlobalConfig[key] = {
        pushEnabled: typeof val?.pushEnabled === "boolean" ? val.pushEnabled : true,
      };
    }

    const merged = { docExpiryDaysDefault: docExpiryDays, pushGlobalConfig };
    const value = JSON.stringify(merged);

    const existing = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    if (existing) {
      await prisma.setting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.setting.create({
        data: {
          key: settingKey(ctx.tenantId),
          value,
          type: "json",
          category: "notifications",
          tenantId: ctx.tenantId,
        },
      });
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error saving notification config:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar configuración" },
      { status: 500 }
    );
  }
}
