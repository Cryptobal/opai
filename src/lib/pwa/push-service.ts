import webPush from 'web-push';
import { prisma } from '@/lib/prisma';
import { batchUnreadCounts } from '@/lib/chat';

// ── VAPID Initialization ──

let vapidInitialized = false;
function ensureVapidInitialized() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment');
  }
  webPush.setVapidDetails(
    'mailto:soporte@opai.cl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidInitialized = true;
}

// ── Global Config Cache (TTL 5 min) ──

const globalConfigCache = new Map<string, { data: boolean; expiry: number }>();

function globalSettingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

async function isGloballyEnabled(tenantId: string, notifKey: string): Promise<boolean> {
  const cacheKey = `${tenantId}:${notifKey}`;
  const cached = globalConfigCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return cached.data;

  try {
    const setting = await prisma.setting.findFirst({
      where: { key: globalSettingKey(tenantId) },
      select: { value: true },
    });
    if (!setting?.value) {
      globalConfigCache.set(cacheKey, { data: true, expiry: Date.now() + 5 * 60_000 });
      return true;
    }
    const parsed = JSON.parse(setting.value) as { pushGlobalConfig?: Record<string, { pushEnabled?: boolean }> };
    const enabled = parsed.pushGlobalConfig?.[notifKey]?.pushEnabled !== false;
    globalConfigCache.set(cacheKey, { data: enabled, expiry: Date.now() + 5 * 60_000 });
    return enabled;
  } catch {
    return true; // fail open
  }
}

// ── Types ──

type UserType = 'contact' | 'guardia' | 'admin';

function toChatSenderType(userType: UserType) {
  const map = { contact: 'CLIENT', guardia: 'GUARD', admin: 'ADMIN' } as const;
  return map[userType];
}

// ── Badge Count Calculation (Prompt 1) ──

/**
 * Returns the set of channelIds that should NOT count toward the badge
 * because the user has set them to MUTED or MENTIONS_ONLY.
 */
async function getMutedOrMentionsOnlyChannelIds(
  senderType: string,
  userId: string,
  channelIds: string[],
): Promise<Set<string>> {
  if (channelIds.length === 0) return new Set();
  const prefs = await prisma.chatNotificationPreference.findMany({
    where: {
      channelId: { in: channelIds },
      userType: senderType,
      userId,
      preference: { in: ['MUTED', 'MENTIONS_ONLY'] },
    },
    select: { channelId: true },
  });
  return new Set(prefs.map((p) => p.channelId));
}

async function calculateBadgeCount(
  tenantId: string,
  userType: UserType,
  userId: string,
): Promise<number> {
  try {
    const senderType = toChatSenderType(userType);

    // Get channels the user participates in via read cursors
    const cursors = await prisma.chatReadCursor.findMany({
      where: { readerType: senderType, readerId: userId },
      select: { channelId: true },
    });
    const channelIds = cursors.map((c) => c.channelId);

    // Exclude channels with MUTED or MENTIONS_ONLY preference from badge count
    const excludedIds = await getMutedOrMentionsOnlyChannelIds(senderType, userId, channelIds);
    const badgeChannelIds = channelIds.filter((id) => !excludedIds.has(id));

    // Batch chat unreads (only channels set to ALL)
    let chatUnreads = 0;
    if (badgeChannelIds.length > 0) {
      const unreads = await batchUnreadCounts(badgeChannelIds, senderType, userId, true);
      for (const count of unreads.values()) chatUnreads += count;
    }

    // Bell notification unreads (admin only) — per-user via NotificationReadState
    let bellUnreads = 0;
    if (userType === 'admin') {
      const allTenantNotifs = await prisma.notification.findMany({
        where: { tenantId },
        select: { id: true, read: true, data: true },
      });
      if (allTenantNotifs.length > 0) {
        const readStateRows = await prisma.notificationReadState.findMany({
          where: {
            userId,
            notificationId: { in: allTenantNotifs.map((n) => n.id) },
          },
          select: { notificationId: true },
        });
        const readSet = new Set(readStateRows.map((r) => r.notificationId));
        bellUnreads = allTenantNotifs.filter((n) => {
          const d = (n.data as Record<string, unknown> | null) ?? {};
          const targetUserId =
            typeof d.targetUserId === 'string' ? d.targetUserId : null;
          if (targetUserId) return targetUserId === userId && !n.read;
          return !readSet.has(n.id);
        }).length;
      }
    }

    return chatUnreads + bellUnreads;
  } catch (err) {
    console.error('[push] Error calculating badge count:', err);
    return 0;
  }
}

/**
 * Calculate badge counts for multiple recipients in batch
 * instead of N individual calculateBadgeCount() calls.
 */
async function batchCalculateBadgeCounts(
  recipients: ChatPushRecipient[],
  tenantId: string,
): Promise<Map<string, number>> {
  const badgeCounts = new Map<string, number>();
  if (recipients.length === 0) return badgeCounts;

  try {
    // 1. Batch: get all read cursors for all recipients
    const allCursors = await prisma.chatReadCursor.findMany({
      where: {
        OR: recipients.map((r) => ({
          readerType: r.subscriberType as any,
          readerId: r.subscriberId,
        })),
      },
      select: {
        readerType: true,
        readerId: true,
        channelId: true,
      },
    });

    // Group channel IDs by user
    const channelsByUser = new Map<string, string[]>();
    for (const cursor of allCursors) {
      const key = `${cursor.readerType}:${cursor.readerId}`;
      const list = channelsByUser.get(key) || [];
      list.push(cursor.channelId);
      channelsByUser.set(key, list);
    }

    // 2. Batch-fetch MUTED/MENTIONS_ONLY preferences for all recipients' channels
    const allChannelIds = [...new Set(allCursors.map((c) => c.channelId))];
    const mutedPrefs = allChannelIds.length > 0
      ? await prisma.chatNotificationPreference.findMany({
          where: {
            channelId: { in: allChannelIds },
            preference: { in: ['MUTED', 'MENTIONS_ONLY'] },
          },
          select: { channelId: true, userType: true, userId: true },
        })
      : [];
    // Key: "userType:userId", Value: Set of excluded channelIds
    const excludedByUser = new Map<string, Set<string>>();
    for (const p of mutedPrefs) {
      const key = `${p.userType}:${p.userId}`;
      const set = excludedByUser.get(key) || new Set();
      set.add(p.channelId);
      excludedByUser.set(key, set);
    }

    // 3a. Pre-compute per-admin bell unreads with a single global query
    // (instead of one count() per admin recipient). Uses NotificationReadState
    // to respect per-user read tracking for broadcast notifications.
    const adminIds = recipients
      .filter((r) => r.subscriberType === 'ADMIN')
      .map((r) => r.subscriberId);

    const unreadByAdminId = new Map<string, number>();
    if (adminIds.length > 0) {
      const allTenantNotifs = await prisma.notification.findMany({
        where: { tenantId },
        select: { id: true, read: true, data: true },
      });
      if (allTenantNotifs.length > 0) {
        const readRows = await prisma.notificationReadState.findMany({
          where: {
            userId: { in: adminIds },
            notificationId: { in: allTenantNotifs.map((n) => n.id) },
          },
          select: { notificationId: true, userId: true },
        });
        const readByUser = new Map<string, Set<string>>();
        for (const adminId of adminIds) readByUser.set(adminId, new Set());
        for (const row of readRows) {
          readByUser.get(row.userId)!.add(row.notificationId);
        }

        for (const adminId of adminIds) {
          const readSet = readByUser.get(adminId)!;
          const count = allTenantNotifs.filter((n) => {
            const d = (n.data as Record<string, unknown> | null) ?? {};
            const targetUserId =
              typeof d.targetUserId === 'string' ? d.targetUserId : null;
            if (targetUserId) return targetUserId === adminId && !n.read;
            return !readSet.has(n.id);
          }).length;
          unreadByAdminId.set(adminId, count);
        }
      }
    }

    // 3b. For each user, batch their unread counts using batchUnreadCounts
    // (single SQL per user, much better than N×3 queries)
    await Promise.all(
      recipients.map(async (r) => {
        const key = `${r.subscriberType}:${r.subscriberId}`;
        const channelIds = channelsByUser.get(key) || [];

        // Exclude channels with MUTED or MENTIONS_ONLY preference from badge count
        const excluded = excludedByUser.get(key);
        const badgeChannelIds = excluded
          ? channelIds.filter((id) => !excluded.has(id))
          : channelIds;

        let chatUnreads = 0;

        if (badgeChannelIds.length > 0) {
          const unreads = await batchUnreadCounts(
            badgeChannelIds,
            r.subscriberType,
            r.subscriberId,
            true,
          );
          for (const count of unreads.values()) chatUnreads += count;
        }

        // Bell notification unreads (admin only) — pre-computed per-user above
        let bellUnreads = 0;
        if (r.subscriberType === 'ADMIN') {
          bellUnreads = unreadByAdminId.get(r.subscriberId) ?? 0;
        }

        badgeCounts.set(key, chatUnreads + bellUnreads);
      }),
    );
  } catch (err) {
    console.error('[push] Error batch calculating badge counts:', err);
  }

  return badgeCounts;
}

// ── Send to Individual Subscription ──

async function sendToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<void> {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
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
}


// ── Chat Message Push Notifications ──

interface ChatPushRecipient {
  subscriberType: 'ADMIN' | 'GUARD' | 'CLIENT';
  subscriberId: string;
}

export async function getChatChannelRecipients(
  channelId: string,
  tenantId: string,
  senderType: string,
  senderId: string,
): Promise<ChatPushRecipient[]> {
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      channelType: true,
      installationId: true,
      groupId: true,
      subType: true,
      accountId: true,
    },
  });
  if (!channel) return [];

  const recipients: ChatPushRecipient[] = [];

  if (channel.channelType === 'INSTALLATION' && channel.installationId) {
    const guards = await prisma.opsAsignacionGuardia.findMany({
      where: { tenantId, installationId: channel.installationId, isActive: true },
      select: { guardiaId: true },
      distinct: ['guardiaId'],
    });
    for (const g of guards) {
      recipients.push({ subscriberType: 'GUARD', subscriberId: g.guardiaId });
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: channel.installationId },
      select: { accountId: true },
    });
    if (installation?.accountId) {
      const contacts = await prisma.crmContact.findMany({
        where: { tenantId, accountId: installation.accountId, portalEnabled: true },
        select: { id: true },
      });
      for (const c of contacts) {
        recipients.push({ subscriberType: 'CLIENT', subscriberId: c.id });
      }
    }

    const guardCursors = await prisma.chatReadCursor.findMany({
      where: { channelId, readerType: 'GUARD' },
      select: { readerId: true },
      distinct: ['readerId'],
    });
    for (const c of guardCursors) {
      if (!recipients.some(r => r.subscriberType === 'GUARD' && r.subscriberId === c.readerId)) {
        recipients.push({ subscriberType: 'GUARD', subscriberId: c.readerId });
      }
    }

    const adminCursors = await prisma.chatReadCursor.findMany({
      where: { channelId, readerType: 'ADMIN' },
      select: { readerId: true },
      distinct: ['readerId'],
    });
    for (const c of adminCursors) {
      recipients.push({ subscriberType: 'ADMIN', subscriberId: c.readerId });
    }
  } else if (channel.channelType === 'GROUP') {
    if (channel.subType === 'client_facing') {
      // Client-facing system groups: notify all tenant admins + any contacts
      // that have already read the channel (so the client sees replies).
      const admins = await prisma.admin.findMany({
        where: { tenantId, status: 'active' },
        select: { id: true },
      });
      for (const a of admins) {
        recipients.push({ subscriberType: 'ADMIN', subscriberId: a.id });
      }

      const contactCursors = await prisma.chatReadCursor.findMany({
        where: { channelId, readerType: 'CLIENT' },
        select: { readerId: true },
        distinct: ['readerId'],
      });
      for (const c of contactCursors) {
        recipients.push({ subscriberType: 'CLIENT', subscriberId: c.readerId });
      }
    } else if (channel.groupId) {
      const members = await prisma.adminGroupMembership.findMany({
        where: { groupId: channel.groupId },
        select: { adminId: true },
      });
      for (const m of members) {
        recipients.push({ subscriberType: 'ADMIN', subscriberId: m.adminId });
      }
    }
  } else if (channel.channelType === 'DIRECT') {
    const participants = await prisma.chatDmParticipant.findMany({
      where: { channelId },
      select: { adminId: true },
    });
    for (const p of participants) {
      recipients.push({ subscriberType: 'ADMIN', subscriberId: p.adminId });
    }
  }

  return recipients.filter(
    (r) => !(r.subscriberType === senderType && r.subscriberId === senderId)
  );
}

/**
 * Filter recipients for in-app notifications (Pusher) by channel notification preference.
 * Same logic as push: MUTED = skip, MENTIONS_ONLY = only if mentioned.
 */
export async function filterRecipientsForInAppNotifications(
  channelId: string,
  recipients: ChatPushRecipient[],
  mentionedUserIds?: string[],
): Promise<ChatPushRecipient[]> {
  if (recipients.length === 0) return [];
  const prefs = await prisma.chatNotificationPreference.findMany({
    where: { channelId },
    select: { userType: true, userId: true, preference: true },
  });
  const prefMap = new Map(prefs.map((p) => [`${p.userType}:${p.userId}`, p.preference]));
  const hasTodosMention = mentionedUserIds?.includes('todos');

  return recipients.filter((r) => {
    const pref = prefMap.get(`${r.subscriberType}:${r.subscriberId}`) || 'ALL';
    if (pref === 'MUTED') return false;
    if (pref === 'MENTIONS_ONLY') {
      const isMentioned = hasTodosMention || mentionedUserIds?.includes(r.subscriberId) || false;
      return isMentioned;
    }
    return true;
  });
}

const SUBSCRIBER_TYPE_TO_USER: Record<string, UserType> = {
  ADMIN: 'admin',
  GUARD: 'guardia',
  CLIENT: 'contact',
};
const SUBSCRIBER_TYPE_TO_PORTAL: Record<string, 'app' | 'guardia' | 'cliente'> = {
  ADMIN: 'app',
  GUARD: 'guardia',
  CLIENT: 'cliente',
};

function getNotificationClickUrl(
  portalType: string | null | undefined,
  subscriberType: string,
  channelId: string,
): string {
  if (portalType) {
    switch (portalType) {
      case 'app':
        return `/chat?channel=${channelId}`;
      case 'guardia':
        return `/portal/guardia?section=chat&channel=${channelId}`;
      case 'rondas':
        return `/portal/rondas?section=chat&channel=${channelId}`;
      case 'cliente':
        return `/portal/cliente?section=chat&channel=${channelId}`;
    }
  }
  // Fallback for subscriptions without portalType
  switch (subscriberType) {
    case 'ADMIN':
      return `/chat?channel=${channelId}`;
    case 'GUARD':
      return `/portal/guardia?section=chat&channel=${channelId}`;
    case 'CLIENT':
      return `/portal/cliente?section=chat&channel=${channelId}`;
    default:
      return `/chat?channel=${channelId}`;
  }
}

interface SendChatPushParams {
  tenantId: string;
  channelId: string;
  channelName: string;
  channelType?: string;
  senderType: string;  // 'ADMIN' | 'GUARD' | 'CLIENT'
  senderId: string;
  senderName: string;
  messagePreview: string;
  mentionedUserIds?: string[];
  imageUrl?: string;
  timestamp?: number;
}

/**
 * Send push notifications to all eligible recipients of a chat channel message.
 * Respects per-channel notification preferences (ALL, MENTIONS_ONLY, MUTED).
 * Batches queries for subscriptions and preferences to avoid N+1.
 */
export async function sendChatPushNotifications({
  tenantId,
  channelId,
  channelName,
  channelType,
  senderType,
  senderId,
  senderName,
  messagePreview,
  mentionedUserIds,
  imageUrl,
  timestamp,
}: SendChatPushParams): Promise<void> {
  try {
    ensureVapidInitialized();

    const recipients = await getChatChannelRecipients(channelId, tenantId, senderType, senderId);
    if (recipients.length === 0) return;

    // Check global config once for the entire batch (Prompt 6)
    if (!(await isGloballyEnabled(tenantId, 'chat_message'))) return;

    // Fetch per-channel notification preferences for all recipients at once
    const prefs = await prisma.chatNotificationPreference.findMany({
      where: { channelId },
      select: { userType: true, userId: true, preference: true },
    });
    const prefMap = new Map(prefs.map((p) => [`${p.userType}:${p.userId}`, p.preference]));

    // Batch-fetch all active subscriptions for all recipients (Prompt 6)
    const recipientFilters = recipients.map((r) => ({
      subscriberType: r.subscriberType as any,
      subscriberId: r.subscriberId,
    }));
    const allSubscriptions = await prisma.chatPushSubscription.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: recipientFilters,
      },
    });
    const subsByUser = new Map<string, typeof allSubscriptions>();
    for (const sub of allSubscriptions) {
      const key = `${sub.subscriberType}:${sub.subscriberId}`;
      const list = subsByUser.get(key) || [];
      list.push(sub);
      subsByUser.set(key, list);
    }

    // Batch-fetch portal notification preferences for non-admin recipients (Prompt 6)
    const portalRecipients = recipients.filter((r) => r.subscriberType !== 'ADMIN');
    const portalPrefsMap = new Map<string, Record<string, { push?: boolean }>>();
    if (portalRecipients.length > 0) {
      const portalPrefs = await prisma.notificationPreference.findMany({
        where: {
          subscriberType: { in: portalRecipients.map((r) => r.subscriberType) },
          subscriberId: { in: portalRecipients.map((r) => r.subscriberId) },
        },
        select: { subscriberType: true, subscriberId: true, preferences: true },
      });
      const subTypeToUserType: Record<string, string> = { GUARD: 'guardia', CLIENT: 'cliente', RONDAS: 'rondas' };
      for (const pp of portalPrefs) {
        const userTypeKey = subTypeToUserType[pp.subscriberType];
        if (!userTypeKey) continue;
        portalPrefsMap.set(`${userTypeKey}:${pp.subscriberId}`, pp.preferences as Record<string, { push?: boolean }>);
      }
    }

    const body = messagePreview.length > 200
      ? messagePreview.slice(0, 200) + '\u2026'
      : messagePreview;

    const hasTodosMention = mentionedUserIds?.includes('todos');

    // Batch-calculate badge counts for all recipients at once
    const badgeCounts = await batchCalculateBadgeCounts(recipients, tenantId);

    await Promise.allSettled(
      recipients.map(async (r) => {
        // Check per-channel preference
        const pref = prefMap.get(`${r.subscriberType}:${r.subscriberId}`) || 'ALL';
        if (pref === 'MUTED') return;

        // MENTIONS_ONLY filter (Prompt 4)
        if (pref === 'MENTIONS_ONLY') {
          const isMentioned = hasTodosMention || mentionedUserIds?.includes(r.subscriberId) || false;
          if (!isMentioned) return;
        }

        const userType = SUBSCRIBER_TYPE_TO_USER[r.subscriberType];
        if (!userType) return;

        // Check portal user-level preferences (non-admin)
        if (userType !== 'admin') {
          const ppKey = `${userType}:${r.subscriberId}`;
          const pp = portalPrefsMap.get(ppKey);
          if (pp?.chat_message?.push === false) return;
        }

        // Get pre-fetched subscriptions for this user
        const userSubs = subsByUser.get(`${r.subscriberType}:${r.subscriberId}`);
        if (!userSubs || userSubs.length === 0) return;

        // Badge count from batch pre-calculation
        const badgeCount = badgeCounts.get(`${r.subscriberType}:${r.subscriberId}`) || 1;

        // Send to each subscription with portal-specific URL
        await Promise.allSettled(
          userSubs.map((sub) => {
            const url = getNotificationClickUrl(sub.portalType, r.subscriberType, channelId);
            const payload = JSON.stringify({
              title: `\uD83D\uDCAC ${channelName}`,
              body: `${senderName}: ${body}`,
              icon: '/icons/icon-192x192.png',
              badge: '/iconos_azul/icon-72x72.png',
              image: imageUrl || undefined,
              tag: `chat-${channelId}`,
              renotify: true,
              silent: false,
              timestamp: timestamp || Date.now(),
              data: {
                url,
                type: 'chat_message',
                channelName,
                senderName,
                channelType: channelType || 'INSTALLATION',
                messagePreview: body,
                badgeCount,
                channelId,
              },
            });
            return sendToSubscription(sub, payload);
          }),
        );
      })
    );
  } catch (err) {
    console.error('[push] sendChatPushNotifications error:', err);
  }
}

// ── Cross-Device Badge Sync ──

/**
 * After a user reads messages on one device, send a silent push
 * to all their OTHER subscriptions so the badge updates everywhere.
 * Uses the 'badge-sync' tag so the notification is invisible.
 */
export async function syncBadgeAcrossDevices(
  tenantId: string,
  userType: UserType,
  userId: string,
  /** The endpoint of the current device — excluded from the sync push */
  excludeEndpoint?: string,
): Promise<void> {
  try {
    ensureVapidInitialized();

    const subscriberType = toChatSenderType(userType);
    const subscriptions = await prisma.chatPushSubscription.findMany({
      where: {
        tenantId,
        subscriberType,
        subscriberId: userId,
        isActive: true,
        ...(excludeEndpoint ? { endpoint: { not: excludeEndpoint } } : {}),
      },
    });

    if (subscriptions.length === 0) return;

    const badgeCount = await calculateBadgeCount(tenantId, userType, userId);

    // Send a data-only (silent) push — the service worker will update the badge
    // without showing a visible notification
    const payload = JSON.stringify({
      title: '',
      body: '',
      silent: true,
      tag: 'badge-sync',
      data: {
        type: 'badge_sync',
        badgeCount,
      },
    });

    await Promise.allSettled(
      subscriptions.map((sub) => sendToSubscription(sub, payload)),
    );
  } catch (err) {
    console.error('[push] syncBadgeAcrossDevices error:', err);
  }
}
