/**
 * Notification preferences helper.
 * Lee las preferencias de notificación del tenant desde Setting.
 * Solo parámetros globales (ej: docExpiryDaysDefault).
 * Las preferencias por usuario (bell/email) están en UserNotificationPreference.
 */

import { prisma } from "@/lib/prisma";

export interface NotificationPrefs {
  docExpiryDaysDefault: number;
}

const DEFAULTS: NotificationPrefs = {
  docExpiryDaysDefault: 30,
};

export async function getNotificationPrefs(tenantId: string): Promise<NotificationPrefs> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: `notification_preferences:${tenantId}` },
    });
    if (!setting?.value) return { ...DEFAULTS };
    const parsed = JSON.parse(setting.value);
    return {
      ...DEFAULTS,
      docExpiryDaysDefault:
        typeof parsed.docExpiryDaysDefault === "number"
          ? Math.max(1, Math.min(365, parsed.docExpiryDaysDefault))
          : DEFAULTS.docExpiryDaysDefault,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
