import webPush from 'web-push';
import { prisma } from "@/lib/prisma";
import { type CoalescePolicy } from "./catalog";

let initialized = false;
function init() {
  if (initialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webPush.setVapidDetails(
    'mailto:soporte@opai.cl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  initialized = true;
}

export interface SendPushParams {
  tenantId: string;
  subscriberType: 'ADMIN' | 'GUARD' | 'CLIENT';
  subscriberId: string;
  notifKey: string;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
  /**
   * Coalesce policy from the catalog. The direct-send path ignores it; the
   * outbox+flush-cron path (added in bloque 5) honors it for non-critical types.
   */
  coalesce?: CoalescePolicy;
}

/**
 * Direct push delivery. Bloque 5 adds an outbox path on top of this for
 * coalesced types so multiple events within a short window collapse into a
 * single banner.
 */
export async function sendPushToSubscriptions(p: SendPushParams) {
  init();

  const subs = await prisma.chatPushSubscription.findMany({
    where: {
      tenantId: p.tenantId,
      subscriberType: p.subscriberType,
      subscriberId: p.subscriberId,
      isActive: true,
    },
  });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: p.title,
    body: p.body,
    icon: '/icons/icon-192x192.png',
    badge: '/iconos_azul/icon-72x72.png',
    tag: p.notifKey,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: { url: p.url, type: 'system_notification', ...(p.data ?? {}) },
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 410 || e.statusCode === 404) {
          await prisma.chatPushSubscription
            .update({ where: { id: sub.id }, data: { isActive: false } })
            .catch(() => {});
        }
      }
    }),
  );
}
