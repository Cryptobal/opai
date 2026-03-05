import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

let vapidInitialized = false;
function ensureVapidInitialized() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment');
  }
  webPush.setVapidDetails(
    'mailto:soporte@gardsecurity.cl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidInitialized = true;
}

function globalSettingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

/** Returns false only when the admin has explicitly set pushEnabled = false for this notifKey. Fails open (returns true) on any error to avoid silently dropping pushes. */
async function isGloballyEnabled(tenantId: string, notifKey: string): Promise<boolean> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: globalSettingKey(tenantId) },
      select: { value: true },
    });
    if (!setting?.value) return true;
    const parsed = JSON.parse(setting.value) as { pushGlobalConfig?: Record<string, { pushEnabled?: boolean }> };
    return parsed.pushGlobalConfig?.[notifKey]?.pushEnabled !== false;
  } catch {
    return true; // fail open — never silently drop pushes on read error
  }
}

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
  ensureVapidInitialized();

  // 1. Check user-level preferences (portal users only)
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

  // 1b. Check global config — admin can disable a notification type for all users
  if (!(await isGloballyEnabled(tenantId, notifKey))) return;

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
      } catch (error: unknown) {
        const err = error as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.chatPushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    })
  );
}

/**
 * Broadcast push to all active owner/admin users in a tenant.
 * Fails open — individual subscription failures are swallowed.
 */
export async function sendPushToAdmins(
  tenantId: string,
  notifKey: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const admins = await prisma.admin.findMany({
    where: { tenantId, role: { in: ['owner', 'admin'] }, status: 'active' },
    select: { id: true },
  });
  await Promise.allSettled(
    admins.map((admin) =>
      sendPushToPortalUser({
        tenantId,
        notifKey,
        userType: 'admin',
        userId: admin.id,
        portalType: 'app',
        title,
        body,
        url,
      })
    )
  );
}

/**
 * Push to a specific list of admin user IDs (e.g., approval group members).
 */
export async function sendPushToSpecificAdmins(
  tenantId: string,
  adminIds: string[],
  notifKey: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  if (adminIds.length === 0) return;
  await Promise.allSettled(
    adminIds.map((userId) =>
      sendPushToPortalUser({
        tenantId,
        notifKey,
        userType: 'admin',
        userId,
        portalType: 'app',
        title,
        body,
        url,
      })
    )
  );
}
