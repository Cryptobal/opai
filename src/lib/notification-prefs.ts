/**
 * Notification preferences helper.
 * Lee las preferencias de notificación del tenant desde Setting.
 */

import { prisma } from "@/lib/prisma";

export interface NotificationPrefs {
  newLeadBellEnabled: boolean;
  newLeadEmailEnabled: boolean;
  followupBellEnabled: boolean;
  followupEmailEnabled: boolean;
  docExpiryBellEnabled: boolean;
  docExpiryEmailEnabled: boolean;
  guardiaDocExpiryBellEnabled: boolean;
  postulacionBellEnabled: boolean;
  refuerzoBellEnabled: boolean;
  refuerzoEmailEnabled: boolean;
  docExpiryDaysDefault: number;
  signatureCompleteBellEnabled: boolean;
  signatureCompleteEmailEnabled: boolean;
  emailOpenedBellEnabled: boolean;
}

const DEFAULTS: NotificationPrefs = {
  newLeadBellEnabled: true,
  newLeadEmailEnabled: false,
  followupBellEnabled: true,
  followupEmailEnabled: true,
  docExpiryBellEnabled: true,
  docExpiryEmailEnabled: true,
  guardiaDocExpiryBellEnabled: true,
  postulacionBellEnabled: true,
  refuerzoBellEnabled: true,
  refuerzoEmailEnabled: true,
  docExpiryDaysDefault: 30,
  signatureCompleteBellEnabled: true,
  signatureCompleteEmailEnabled: true,
  emailOpenedBellEnabled: true,
};

export async function getNotificationPrefs(tenantId: string): Promise<NotificationPrefs> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: `notification_preferences:${tenantId}` },
    });
    if (!setting?.value) return { ...DEFAULTS };
    const parsed = JSON.parse(setting.value);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
