import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  throw new Error('[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment');
}

webPush.setVapidDetails(
  'mailto:soporte@gardsecurity.cl',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

type UserType = 'contact' | 'guardia' | 'admin';

function toChatSenderType(userType: UserType) {
  const map = { contact: 'CLIENT', guardia: 'GUARD', admin: 'ADMIN' } as const;
  return map[userType];
}

interface SendPushParams {
  tenantId: string;
  notifKey: string;
  userType: UserType;
  userId: string;
  portalType: 'cliente' | 'guardia' | 'rondas' | 'app';
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToPortalUser({
  tenantId,
  notifKey,
  userType,
  userId,
  portalType,
  title,
  body,
  url,
  tag,
}: SendPushParams) {
  // 1. Check preferences (only for portal users — admin uses UserNotificationPreference)
  if (userType !== 'admin') {
    const prefs = await prisma.portalNotificationPreference.findUnique({
      where: {
        userType_userId_portalType: { userType, userId, portalType },
      },
    });

    if (prefs) {
      const prefMap = prefs.preferences as Record<string, { push?: boolean }>;
      if (prefMap[notifKey]?.push === false) return;
    }
  }

  // 2. Get active push subscriptions
  const senderType = toChatSenderType(userType);
  const subscriptions = await prisma.chatPushSubscription.findMany({
    where: {
      tenantId,
      subscriberType: senderType,
      subscriberId: userId,
      isActive: true,
    },
  });

  if (subscriptions.length === 0) return;

  const icon = '/iconos_azul/icon-192x192.png';

  // 3. Send to each subscription
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title,
            body,
            icon,
            badge: icon,
            tag: tag || notifKey,
            data: { url, type: notifKey },
          })
        );
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await prisma.chatPushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    })
  );
}
