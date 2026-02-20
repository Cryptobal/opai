/**
 * API: /api/notifications/config
 * GET  - Obtener preferencias de notificación del tenant
 * POST - Guardar preferencias de notificación del tenant
 *
 * Almacenadas en la tabla Setting con key="notification_preferences" + tenantId
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";

function settingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

const DEFAULTS: Record<string, unknown> = {
  // Leads
  newLeadBellEnabled: true,
  newLeadEmailEnabled: false,
  // Follow-ups
  followupBellEnabled: true,
  followupEmailEnabled: true,
  // Documentos
  docExpiryBellEnabled: true,
  docExpiryEmailEnabled: true,
  // Ops - Documentos de guardias
  guardiaDocExpiryBellEnabled: true,
  // Ops - Nueva postulación
  postulacionBellEnabled: true,
  // Ops - Turnos de refuerzo
  refuerzoBellEnabled: true,
  refuerzoEmailEnabled: true,
  docExpiryDaysDefault: 30,
  // Firma electrónica
  signatureCompleteBellEnabled: true,
  signatureCompleteEmailEnabled: true,
  // Email tracking
  emailOpenedBellEnabled: true,
};

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    let prefs = { ...DEFAULTS };
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        prefs = { ...DEFAULTS, ...parsed };
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

    // Merge con existente
    const existing = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    let currentPrefs = { ...DEFAULTS };
    if (existing?.value) {
      try {
        currentPrefs = { ...DEFAULTS, ...JSON.parse(existing.value) };
      } catch {
        // corrupted — start fresh
      }
    }

    const merged = { ...currentPrefs, ...body };
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
