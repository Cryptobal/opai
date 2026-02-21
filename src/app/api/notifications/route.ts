/**
 * API Route: /api/notifications
 * GET    - Listar notificaciones del tenant
 * PATCH  - Marcar notificaciones como leídas
 * DELETE - Eliminar notificaciones (todas o por IDs)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { addDays } from "date-fns";
import { NOTIFICATION_TYPES, canSeeNotificationType, type UserNotifPrefsMap } from "@/lib/notification-types";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import type { AuthContext } from "@/lib/api-auth";
import type { Prisma } from "@prisma/client";

async function getRoleExcludedNotificationTypes(ctx: AuthContext): Promise<string[]> {
  const perms = await resolveApiPerms(ctx);
  return NOTIFICATION_TYPES
    .filter((t) => !canSeeNotificationType(perms, t))
    .map((t) => t.key);
}

async function getUserBellDisabledTypes(ctx: AuthContext): Promise<string[]> {
  const record = await prisma.userNotificationPreference.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
  });
  if (!record?.preferences) return [];
  const prefs = record.preferences as unknown as UserNotifPrefsMap;
  return Object.entries(prefs)
    .filter(([, pref]) => pref.bell === false)
    .map(([key]) => key);
}

function visibleNotificationsWhere(
  ctx: AuthContext,
  roleExcludedTypes: string[],
  options?: { unreadOnly?: boolean; ids?: string[] }
): Prisma.NotificationWhereInput {
  const { unreadOnly = false, ids } = options || {};
  const baseExclusions = roleExcludedTypes.filter((type) => type !== "mention");
  // Types that use targeted delivery (only visible to specific users via data.targetUserId)
  const targetedTypes = ["ticket_approved", "ticket_rejected", "refuerzo_solicitud_created", "mention"];

  const orConditions: Prisma.NotificationWhereInput[] = [
    {
      // Eventos generales del tenant, respetando exclusiones por módulo/rol.
      // Excluimos targeted types aquí; se agregan con filtro de usuario abajo.
      type: {
        notIn:
          baseExclusions.length > 0
            ? [...baseExclusions, ...targetedTypes]
            : targetedTypes,
      },
    },
  ];

  // Menciones: SIEMPRE visibles para el usuario mencionado (sin filtrar por CRM).
  orConditions.push({
    type: "mention",
    data: { path: ["mentionUserId"], equals: ctx.userId },
  });

  // Ticket approval/rejection/refuerzo notifications: solo visibles para el usuario destinatario.
  // Si tienen data.targetUserId, solo ese usuario las ve. Si no lo tienen (legacy), se muestran a todos.
  for (const targetedType of ["ticket_approved", "ticket_rejected", "refuerzo_solicitud_created"]) {
    if (baseExclusions.includes(targetedType)) continue; // Skip if role excludes it
    orConditions.push({
      type: targetedType,
      data: { path: ["targetUserId"], equals: ctx.userId },
    });
  }

  return {
    tenantId: ctx.tenantId,
    ...(ids?.length ? { id: { in: ids } } : {}),
    ...(unreadOnly ? { read: false } : {}),
    OR: orConditions,
  };
}

async function ensureGuardiaDocExpiryNotifications(tenantId: string, enabled: boolean) {
  if (!enabled) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const config = await getGuardiaDocumentosConfig(tenantId);
  const byType = new Map(config.filter((c) => c.hasExpiration).map((c) => [c.code, c.alertDaysBefore]));

  const maxDays = Math.max(30, ...Array.from(byType.values()));
  const limitDate = addDays(today, maxDays);

  const docs = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      expiresAt: { not: null, lte: limitDate },
      status: { not: "vencido" },
    },
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    take: 200,
  });

  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const alertDays = byType.get(doc.type);
    if (alertDays === undefined) continue;
    const expiresAt = new Date(doc.expiresAt);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysRemaining > alertDays) continue;
    const type = daysRemaining < 0 ? "guardia_doc_expired" : "guardia_doc_expiring";
    const personName = `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim();
    const title =
      daysRemaining < 0
        ? `Documento vencido de guardia: ${personName}`
        : `Documento por vencer de guardia: ${personName}`;
    const message =
      daysRemaining < 0
        ? `${doc.type} venció y requiere renovación.`
        : `${doc.type} vence en ${daysRemaining} día(s).`;

    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        type,
        data: { path: ["guardiaDocumentId"], equals: doc.id },
        createdAt: { gte: addDays(today, -1) },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.notification.create({
      data: {
        tenantId,
        type,
        title,
        message,
        link: `/personas/guardias/${doc.guardiaId}`,
        data: {
          guardiaId: doc.guardiaId,
          guardiaDocumentId: doc.id,
          expiresAt: doc.expiresAt,
          docType: doc.type,
        },
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    await ensureGuardiaDocExpiryNotifications(ctx.tenantId, true);

    const excludedTypes = new Set<string>(await getRoleExcludedNotificationTypes(ctx));
    const userDisabled = await getUserBellDisabledTypes(ctx);
    for (const t of userDisabled) excludedTypes.add(t);
    const excludedTypesList = Array.from(excludedTypes);
    const notificationsWhere = visibleNotificationsWhere(ctx, excludedTypesList, {
      unreadOnly,
    });

    const notifications = await prisma.notification.findMany({
      where: notificationsWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: visibleNotificationsWhere(ctx, excludedTypesList, { unreadOnly: true }),
    });

    return NextResponse.json({
      success: true,
      data: notifications,
      meta: { unreadCount },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = await getRoleExcludedNotificationTypes(ctx);

    const body = await request.json();

    if (body.markAllRead) {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes, { unreadOnly: true }),
        data: { read: true },
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes, { ids: body.ids }),
        data: { read: true },
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'markAllRead: true' or 'ids: string[]'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = await getRoleExcludedNotificationTypes(ctx);

    const body = await request.json();

    if (body.deleteAll) {
      await prisma.notification.deleteMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes),
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      await prisma.notification.deleteMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes, { ids: body.ids }),
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'deleteAll: true' or 'ids: string[]'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete notifications" },
      { status: 500 }
    );
  }
}
