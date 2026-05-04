import webPush from 'web-push';
import { prisma } from "@/lib/prisma";
import { type CoalescePolicy, getUnifiedType } from "./catalog";

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
   * If set, non-critical pushes go through the outbox (collected and flushed
   * by the flush-push-outbox cron). Critical types bypass the outbox.
   */
  coalesce?: CoalescePolicy;
  /**
   * Filtro por canal. Si está omitido, envía a todas las subscriptions activas
   * (preserva el comportamiento legacy). En `notify()` lo pasamos según
   * resolvePrefs().
   */
  channels?: { desktop: boolean; mobile: boolean };
}

const MOBILE_UA_REGEX = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i;

function isMobileSubscription(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false; // Fail open to desktop (la mayoría)
  return MOBILE_UA_REGEX.test(userAgent);
}

function isCritical(notifKey: string): boolean {
  return getUnifiedType(notifKey)?.critical === true;
}

function buildGroupKey(p: SendPushParams): string {
  // Initial implementation: group by (notifKey, tenant). Future iterations can
  // honor coalesce.groupBy ('module' | 'submodule' | 'entity') by including
  // a hash of relevant entity ids passed in `data`.
  return `${p.notifKey}:${p.tenantId}`;
}

function buildCoalescedBody(notifKey: string, count: number, lastBody: string): string {
  if (count === 1) return lastBody;
  const typeLabel = getUnifiedType(notifKey)?.label ?? notifKey;
  const trimmed = lastBody.length > 100 ? `${lastBody.slice(0, 100)}…` : lastBody;
  return `${count} eventos de ${typeLabel}. Último: ${trimmed}`;
}

async function enqueueOrCoalesce(p: SendPushParams) {
  const groupKey = buildGroupKey(p);
  const existing = await prisma.pushOutbox.findFirst({
    where: {
      subscriberType: p.subscriberType,
      subscriberId: p.subscriberId,
      groupKey,
      sentAt: null,
    },
  });
  const due = new Date(Date.now() + p.coalesce!.windowSeconds * 1000);
  if (existing) {
    const newCount = existing.count + 1;
    await prisma.pushOutbox.update({
      where: { id: existing.id },
      data: {
        count: newCount,
        body: buildCoalescedBody(p.notifKey, newCount, p.body),
        scheduledFor: due,
        url: p.url ?? existing.url,
        data: (p.data ?? {}) as object,
      },
    });
  } else {
    await prisma.pushOutbox.create({
      data: {
        tenantId: p.tenantId,
        subscriberType: p.subscriberType,
        subscriberId: p.subscriberId,
        notifKey: p.notifKey,
        groupKey,
        title: p.title,
        body: p.body,
        url: p.url,
        data: (p.data ?? {}) as object,
        scheduledFor: due,
      },
    });
  }
}

/**
 * Direct push delivery, with optional coalesce path:
 * - If `coalesce` is set AND the type is not `critical`, the push is enqueued
 *   in push_outbox; the flush-push-outbox cron drains pending rows and sends
 *   one coalesced banner per group_key.
 * - Otherwise (critical types or no coalesce), send immediately via web-push.
 */
export async function sendPushToSubscriptions(p: SendPushParams) {
  init();

  if (p.coalesce && !isCritical(p.notifKey)) {
    try {
      await enqueueOrCoalesce(p);
      return;
    } catch (err) {
      console.error('[push-sender] enqueue failed, falling back to direct send:', err);
      // fall through to direct send
    }
  }

  const subs = await prisma.chatPushSubscription.findMany({
    where: {
      tenantId: p.tenantId,
      subscriberType: p.subscriberType,
      subscriberId: p.subscriberId,
      isActive: true,
    },
  });
  if (subs.length === 0) return;

  let filtered = subs;
  if (p.channels && (!p.channels.desktop || !p.channels.mobile)) {
    filtered = subs.filter((s) => {
      const isMobile = isMobileSubscription(s.userAgent);
      if (isMobile && !p.channels!.mobile) return false;
      if (!isMobile && !p.channels!.desktop) return false;
      return true;
    });
  }
  if (filtered.length === 0) return;

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
    filtered.map(async (sub) => {
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
