/**
 * Single source of truth for "which bell notifications does a user actually see,
 * and how many are unread". Shared by:
 *   - GET /api/notifications        (the bell panel + its unread count)
 *   - GET /api/badge/count          (the PWA app badge)
 *   - lib/pwa/push-service          (badge count pushed on delivery)
 *
 * Previously the badge/push paths counted ALL tenant notifications with no
 * per-user visibility scoping, so broadcast notifications the user could not
 * even see in their bell (role/module-excluded types, user-disabled bell types,
 * note/mention types routed to the Activity feed) still inflated the app badge.
 * That produced a persistent badge (e.g. "3") with zero notifications visible on
 * open. Everyone must go through the same scoping to stay in sync.
 */

import { prisma } from "@/lib/prisma";
import { resolveApiPerms, type AuthContext } from "@/lib/api-auth";
import {
  NOTIFICATION_TYPES,
  canSeeNotificationType,
  type UserNotifPrefsMap,
} from "@/lib/notification-types";
import type { Prisma } from "@prisma/client";

export function asNotifData(
  data: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

/** Types the user's role/module permissions hide from them entirely. */
export async function getRoleExcludedNotificationTypes(
  ctx: AuthContext,
): Promise<string[]> {
  const perms = await resolveApiPerms(ctx);
  return NOTIFICATION_TYPES.filter((t) => !canSeeNotificationType(perms, t)).map(
    (t) => t.key,
  );
}

/** Types the user has muted for the bell in their personal notification prefs. */
export async function getUserBellDisabledTypes(
  ctx: AuthContext,
): Promise<string[]> {
  const record = await prisma.notificationPreference.findUnique({
    where: {
      subscriberType_subscriberId: {
        subscriberType: "ADMIN",
        subscriberId: ctx.userId,
      },
    },
  });
  if (!record?.preferences) return [];
  const prefs = record.preferences as unknown as UserNotifPrefsMap;
  return Object.entries(prefs)
    .filter(([, pref]) => pref.bell === false)
    .map(([key]) => key);
}

/**
 * Prisma `where` that scopes notifications to the ones a user is allowed to see
 * in their bell — respecting role/module exclusions and per-user targeting.
 */
export function visibleNotificationsWhere(
  ctx: AuthContext,
  roleExcludedTypes: string[],
  options?: { unreadOnly?: boolean; read?: boolean; ids?: string[]; types?: string[] },
): Prisma.NotificationWhereInput {
  const { unreadOnly = false, read, ids, types } = options || {};
  // Note-related types (mention_direct, mention_group, note_thread_reply, note_alert)
  // are handled exclusively by the Activity feed, not legacy Notificaciones.
  const baseExclusions = roleExcludedTypes.filter((type) => type !== "mention");
  // Types that use targeted delivery (only visible to specific users via data.targetUserId)
  const targetedTypes = [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "mention",
    "ticket_mention",
    "ticket_created",
    "ticket_assigned",
    "ticket_sla_breached",
    "ticket_sla_approaching",
    "ticket_sla_breached_batch",
  ];

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

  // Menciones legacy: visibles para el usuario mencionado (targetUserId o mentionUserId).
  orConditions.push({
    type: "mention",
    OR: [
      { data: { path: ["targetUserId"], equals: ctx.userId } },
      { data: { path: ["mentionUserId"], equals: ctx.userId } },
    ],
  });

  // Targeted notifications: solo visibles para el usuario destinatario.
  // Si tienen data.targetUserId, solo ese usuario las ve. Si no lo tienen (legacy), se muestran a todos.
  for (const targetedType of [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "ticket_mention",
    "ticket_created",
    "ticket_assigned",
    "ticket_sla_breached",
    "ticket_sla_approaching",
    "ticket_sla_breached_batch",
  ]) {
    if (baseExclusions.includes(targetedType)) continue; // Skip if role excludes it
    orConditions.push({
      type: targetedType,
      data: { path: ["targetUserId"], equals: ctx.userId },
    });
  }

  return {
    tenantId: ctx.tenantId,
    ...(ids?.length ? { id: { in: ids } } : {}),
    ...(typeof read === "boolean" ? { read } : unreadOnly ? { read: false } : {}),
    ...(types?.length ? { type: { in: types } } : {}),
    OR: orConditions,
  };
}

/**
 * Per-user unread count over the notifications the user actually sees in their
 * bell. Mirrors the count the bell panel renders. Applies role exclusions and,
 * unless `ignoreUserBellPrefs` is set, the user's muted bell types too.
 */
export async function computeBellUnreadCount(
  ctx: AuthContext,
  options?: { ignoreUserBellPrefs?: boolean },
): Promise<number> {
  const excluded = new Set<string>(await getRoleExcludedNotificationTypes(ctx));
  if (!options?.ignoreUserBellPrefs) {
    for (const t of await getUserBellDisabledTypes(ctx)) excluded.add(t);
  }
  const excludedList = Array.from(excluded);

  const visible = await prisma.notification.findMany({
    where: visibleNotificationsWhere(ctx, excludedList),
    select: { id: true, read: true, data: true },
  });
  if (visible.length === 0) return 0;

  const readStateSet = new Set(
    (
      await prisma.notificationReadState.findMany({
        where: {
          userId: ctx.userId,
          notificationId: { in: visible.map((n) => n.id) },
        },
        select: { notificationId: true },
      })
    ).map((rs) => rs.notificationId),
  );

  return visible.filter((n) => {
    const d = asNotifData(n.data);
    const targeted =
      typeof d.targetUserId === "string" && d.targetUserId.length > 0;
    return targeted ? !n.read : !readStateSet.has(n.id);
  }).length;
}
