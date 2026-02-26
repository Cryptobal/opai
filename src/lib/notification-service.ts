/**
 * Unified Notification Service
 *
 * Centraliza la creación de notificaciones (bell) y envío de emails.
 * Respeta las preferencias por usuario para decidir qué canal usar.
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { render } from "@react-email/render";
import NotificationEmail from "@/emails/NotificationEmail";
import { NOTIFICATION_TYPE_MAP, canSeeNotificationType, type UserNotifPrefsMap } from "@/lib/notification-types";
import { resolvePermissions } from "@/lib/permissions-server";

interface CreateNotificationInput {
  tenantId: string;
  type: string;
  title: string;
  message?: string | null;
  emailMessage?: string | null;
  link?: string | null;
  data?: Record<string, unknown>;
}

interface UserForNotification {
  id: string;
  email: string;
  role: string;
  roleTemplateId: string | null;
}

/**
 * Envía una notificación respetando preferencias de cada usuario.
 *
 * 1. Busca todos los usuarios del tenant
 * 2. Filtra por acceso al módulo de la notificación
 * 3. Para cada usuario que tiene bell habilitado: crea la notificación
 * 4. Para cada usuario que tiene email habilitado: envía email
 *
 * La notificación bell sigue siendo tenant-wide (el filtrado lo hace el GET),
 * pero solo se crea si al menos un usuario la quiere. Los emails se envían
 * individualmente a cada usuario que los tenga habilitados.
 */
export async function sendNotification(input: CreateNotificationInput) {
  const { tenantId, type, title, message, emailMessage, link, data } = input;
  const typeDef = NOTIFICATION_TYPE_MAP.get(type);

  const users = await prisma.admin.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, email: true, role: true, roleTemplateId: true },
  });

  if (users.length === 0) return;

  const userPrefsRecords = await prisma.userNotificationPreference.findMany({
    where: { tenantId, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, preferences: true },
  });

  const prefsMap = new Map<string, UserNotifPrefsMap>();
  for (const rec of userPrefsRecords) {
    prefsMap.set(rec.userId, rec.preferences as unknown as UserNotifPrefsMap);
  }

  let anyBellEnabled = false;
  const emailRecipients: string[] = [];

  for (const user of users) {
    const canSee = await userCanSeeType(user, typeDef);
    if (!canSee) continue;

    const prefs = prefsMap.get(user.id);
    const pref = prefs?.[type];

    const bellEnabled = pref?.bell ?? typeDef?.defaultBell ?? true;
    const emailEnabled = pref?.email ?? typeDef?.defaultEmail ?? false;

    if (bellEnabled) anyBellEnabled = true;
    if (emailEnabled && user.email) emailRecipients.push(user.email);
  }

  if (anyBellEnabled) {
    try {
      await prisma.notification.create({
        data: { tenantId, type, title, message, link, data: (data ?? undefined) as any },
      });
    } catch (err) {
      console.error(`[notification-service] Error creating bell notification (${type}):`, err);
    }
  }

  if (emailRecipients.length > 0) {
    try {
      const emailConfig = await getTenantEmailConfig(tenantId);
      const category = typeDef?.category;
      const actionLabel = link ? "Ver en OPAI" : undefined;

      const html = await render(
        NotificationEmail({
          title,
          message: emailMessage ?? message ?? undefined,
          actionUrl: link ?? undefined,
          actionLabel,
          category,
        })
      );

      const batchSize = 50;
      for (let i = 0; i < emailRecipients.length; i += batchSize) {
        const batch = emailRecipients.slice(i, i + batchSize);
        await resend.emails.send({
          from: emailConfig.from,
          replyTo: emailConfig.replyTo,
          to: batch,
          subject: title,
          html,
        });
      }
    } catch (err) {
      console.error(`[notification-service] Error sending email (${type}):`, err);
    }
  }
}

/**
 * Versión simplificada para notificaciones dirigidas a un usuario específico (ej: menciones).
 */
export async function sendNotificationToUser(
  input: CreateNotificationInput & { targetUserId: string }
) {
  const { tenantId, type, title, message, emailMessage, link, data, targetUserId } = input;
  const typeDef = NOTIFICATION_TYPE_MAP.get(type);

  const user = await prisma.admin.findFirst({
    where: { id: targetUserId, tenantId, status: "active" },
    select: { id: true, email: true, role: true, roleTemplateId: true },
  });

  if (!user) return;

  const prefsRecord = await prisma.userNotificationPreference.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId } },
  });

  const prefs = prefsRecord?.preferences as unknown as UserNotifPrefsMap | undefined;
  const pref = prefs?.[type];

  const bellEnabled = pref?.bell ?? typeDef?.defaultBell ?? true;
  // Menciones: siempre enviar email (bypass preferencias) — es una comunicación directa
  const emailEnabled =
    type === "mention" ||
    type === "mention_direct" ||
    type === "mention_group" ||
    type === "note_thread_reply"
      ? true
      : (pref?.email ?? typeDef?.defaultEmail ?? false);

  if (bellEnabled) {
    try {
      await prisma.notification.create({
        data: {
          tenantId,
          type,
          title,
          message,
          link,
          data: { ...(data ?? {}), targetUserId } as any,
        },
      });
    } catch (err) {
      console.error(`[notification-service] Error creating bell for user (${type}):`, err);
    }
  }

  if (emailEnabled && user.email) {
    try {
      const emailConfig = await getTenantEmailConfig(tenantId);
      const actionLabel = link ? "Ver en OPAI" : undefined;
      const html = await render(
        NotificationEmail({
          title,
          message: emailMessage ?? message ?? undefined,
          actionUrl: link ?? undefined,
          actionLabel,
          category: typeDef?.category,
        })
      );

      await resend.emails.send({
        from: emailConfig.from,
        replyTo: emailConfig.replyTo,
        to: user.email,
        subject: title,
        html,
      });
    } catch (err) {
      console.error(`[notification-service] Error sending email to user (${type}):`, err);
    }
  }
}

/**
 * Envía notificación dirigida a una lista específica de usuarios (por ID).
 * Crea una bell notification por usuario (con targetUserId en data para filtrado)
 * y envía email a quienes lo tengan habilitado.
 */
export async function sendNotificationToUsers(
  input: CreateNotificationInput & { targetUserIds: string[] }
) {
  const { tenantId, type, title, message, emailMessage, link, data, targetUserIds } = input;
  if (targetUserIds.length === 0) return;

  // Deduplicate
  const uniqueIds = [...new Set(targetUserIds)];
  const typeDef = NOTIFICATION_TYPE_MAP.get(type);

  const users = await prisma.admin.findMany({
    where: { id: { in: uniqueIds }, tenantId, status: "active" },
    select: { id: true, email: true, role: true, roleTemplateId: true },
  });

  if (users.length === 0) return;

  const userPrefsRecords = await prisma.userNotificationPreference.findMany({
    where: { tenantId, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, preferences: true },
  });

  const prefsMap = new Map<string, UserNotifPrefsMap>();
  for (const rec of userPrefsRecords) {
    prefsMap.set(rec.userId, rec.preferences as unknown as UserNotifPrefsMap);
  }

  const emailRecipients: string[] = [];

  for (const user of users) {
    const prefs = prefsMap.get(user.id);
    const pref = prefs?.[type];
    const bellEnabled = pref?.bell ?? typeDef?.defaultBell ?? true;
    const emailEnabled =
      type === "mention" ||
      type === "mention_direct" ||
      type === "mention_group" ||
      type === "note_thread_reply"
        ? true
        : (pref?.email ?? typeDef?.defaultEmail ?? false);

    if (bellEnabled) {
      try {
        await prisma.notification.create({
          data: {
            tenantId,
            type,
            title,
            message,
            link,
            data: { ...(data ?? {}), targetUserId: user.id } as any,
          },
        });
      } catch (err) {
        console.error(`[notification-service] Error creating bell for user ${user.id} (${type}):`, err);
      }
    }

    if (emailEnabled && user.email) emailRecipients.push(user.email);
  }

  if (emailRecipients.length > 0) {
    try {
      const emailConfig = await getTenantEmailConfig(tenantId);
      const actionLabel = link ? "Ver en OPAI" : undefined;
      const html = await render(
        NotificationEmail({
          title,
          message: emailMessage ?? message ?? undefined,
          actionUrl: link ?? undefined,
          actionLabel,
          category: typeDef?.category,
        })
      );

      const batchSize = 50;
      for (let i = 0; i < emailRecipients.length; i += batchSize) {
        const batch = emailRecipients.slice(i, i + batchSize);
        await resend.emails.send({
          from: emailConfig.from,
          replyTo: emailConfig.replyTo,
          to: batch,
          subject: title,
          html,
        });
      }
    } catch (err) {
      console.error(`[notification-service] Error sending emails (${type}):`, err);
    }
  }
}

async function userCanSeeType(
  user: UserForNotification,
  typeDef?: import("@/lib/notification-types").NotificationTypeDef
): Promise<boolean> {
  if (!typeDef) return true;
  try {
    const perms = await resolvePermissions({
      role: user.role,
      roleTemplateId: user.roleTemplateId,
    });
    return canSeeNotificationType(perms, typeDef);
  } catch {
    return false;
  }
}

/**
 * Obtiene la lista de emails de usuarios que deben recibir notificaciones por email
 * para un tipo dado (respetando acceso al módulo y preferencias por usuario).
 */
export async function getEmailRecipientsForType(
  tenantId: string,
  type: string
): Promise<string[]> {
  const typeDef = NOTIFICATION_TYPE_MAP.get(type);
  const users = await prisma.admin.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, email: true, role: true, roleTemplateId: true },
  });
  if (users.length === 0) return [];

  const userPrefsRecords = await prisma.userNotificationPreference.findMany({
    where: { tenantId, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, preferences: true },
  });
  const prefsMap = new Map<string, UserNotifPrefsMap>();
  for (const rec of userPrefsRecords) {
    prefsMap.set(rec.userId, rec.preferences as unknown as UserNotifPrefsMap);
  }

  const emails: string[] = [];
  for (const user of users) {
    const canSee = await userCanSeeType(user, typeDef);
    if (!canSee) continue;
    const prefs = prefsMap.get(user.id);
    const pref = prefs?.[type];
    const emailEnabled = pref?.email ?? typeDef?.defaultEmail ?? false;
    if (emailEnabled && user.email) {
      const email = user.email.trim().toLowerCase();
      if (email.length > 3 && email.includes("@")) emails.push(email);
    }
  }
  return Array.from(new Set(emails));
}
