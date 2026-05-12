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
  getDefaultUserPrefs,
  type UserNotifPrefsMap,
} from "@/lib/notification-types";

/** Mismo modelo que usa `resolve-prefs.ts`: `NotificationPreference`, subscriber ADMIN. */
const ADMIN_SUBSCRIBER = "ADMIN" as const;

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);

    const record = await prisma.notificationPreference.findUnique({
      where: {
        subscriberType_subscriberId: {
          subscriberType: ADMIN_SUBSCRIBER,
          subscriberId: ctx.userId,
        },
      },
    });

    const defaults = getDefaultUserPrefs();
    const saved: UserNotifPrefsMap = record?.preferences
      ? (record.preferences as unknown as UserNotifPrefsMap)
      : {};

    const merged = { ...defaults, ...saved };

    const accessibleTypes = NOTIFICATION_TYPES.filter((t) =>
      canSeeNotificationType(perms, t)
    );

    const filteredPrefs: UserNotifPrefsMap = {};
    for (const t of accessibleTypes) {
      filteredPrefs[t.key] = merged[t.key] ?? {
        bell: t.defaultBell,
        email: t.defaultEmail,
      };
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

    const existing = await prisma.notificationPreference.findUnique({
      where: {
        subscriberType_subscriberId: {
          subscriberType: ADMIN_SUBSCRIBER,
          subscriberId: ctx.userId,
        },
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

    await prisma.notificationPreference.upsert({
      where: {
        subscriberType_subscriberId: {
          subscriberType: ADMIN_SUBSCRIBER,
          subscriberId: ctx.userId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        subscriberType: ADMIN_SUBSCRIBER,
        subscriberId: ctx.userId,
        preferences: merged as object,
      },
      update: {
        tenantId: ctx.tenantId,
        preferences: merged as object,
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
