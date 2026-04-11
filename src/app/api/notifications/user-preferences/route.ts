/**
 * API: /api/notifications/user-preferences
 * GET  - Obtener preferencias de notificación del usuario autenticado
 * PUT  - Guardar preferencias de notificación del usuario autenticado
 *
 * Cada usuario puede configurar qué notificaciones recibir (bell + email)
 * de forma independiente. Solo ve tipos relevantes a los módulos que tiene acceso.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import {
  NOTIFICATION_TYPES,
  canSeeNotificationType,
  type UserNotifPrefsMap,
} from "@/lib/notification-types";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);

    const record = await prisma.userNotificationPreference.findUnique({
      where: {
        userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId },
      },
    });

    const saved: UserNotifPrefsMap = record?.preferences
      ? (record.preferences as unknown as UserNotifPrefsMap)
      : {};

    // Si el usuario ya tiene preferencias guardadas, las claves NO guardadas
    // (tipos añadidos después de su último guardado) deben aparecer con email
    // apagado por defecto. Esta lógica refleja exactamente la que aplica
    // notification-service al momento de enviar: no sorprender al usuario con
    // emails de tipos que nunca ha visto/aceptado explícitamente.
    const userHasSavedPrefs = Object.keys(saved).length > 0;

    const accessibleTypes = NOTIFICATION_TYPES.filter((t) =>
      canSeeNotificationType(perms, t)
    );

    const filteredPrefs: UserNotifPrefsMap = {};
    for (const t of accessibleTypes) {
      const savedPref = saved[t.key];
      if (savedPref && typeof savedPref === "object") {
        filteredPrefs[t.key] = {
          bell: typeof savedPref.bell === "boolean" ? savedPref.bell : t.defaultBell,
          email: typeof savedPref.email === "boolean" ? savedPref.email : t.defaultEmail,
        };
      } else if (userHasSavedPrefs) {
        // Tipo nuevo añadido después del último guardado del usuario:
        // bell visible por defecto (para que lo descubra), email apagado.
        filteredPrefs[t.key] = {
          bell: t.defaultBell,
          email: false,
        };
      } else {
        // Usuario nunca ha guardado: defaults del tipo.
        filteredPrefs[t.key] = {
          bell: t.defaultBell,
          email: t.defaultEmail,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        preferences: filteredPrefs,
        types: accessibleTypes,
      },
    });
  } catch (error) {
    console.error("Error fetching user notification preferences:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener preferencias" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const preferences = body.preferences as UserNotifPrefsMap;

    if (!preferences || typeof preferences !== "object") {
      return NextResponse.json(
        { success: false, error: "Se requiere un objeto 'preferences'" },
        { status: 400 }
      );
    }

    const perms = await resolveApiPerms(ctx);
    const accessibleKeys = new Set(
      NOTIFICATION_TYPES.filter((t) => canSeeNotificationType(perms, t)).map(
        (t) => t.key
      )
    );

    const existing = await prisma.userNotificationPreference.findUnique({
      where: {
        userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId },
      },
    });

    const currentPrefs: UserNotifPrefsMap = existing?.preferences
      ? (existing.preferences as unknown as UserNotifPrefsMap)
      : {};

    const merged: UserNotifPrefsMap = { ...currentPrefs };
    for (const [key, value] of Object.entries(preferences)) {
      if (accessibleKeys.has(key) && value && typeof value === "object") {
        merged[key] = {
          bell: typeof value.bell === "boolean" ? value.bell : true,
          email: typeof value.email === "boolean" ? value.email : false,
        };
      }
    }

    await prisma.userNotificationPreference.upsert({
      where: {
        userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId },
      },
      create: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        preferences: merged as any,
      },
      update: {
        preferences: merged as any,
      },
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error saving user notification preferences:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar preferencias" },
      { status: 500 }
    );
  }
}
