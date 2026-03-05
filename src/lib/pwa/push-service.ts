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

// ── Chat message push notifications ──

interface ChatPushRecipient {
  subscriberType: 'ADMIN' | 'GUARD' | 'CLIENT';
  subscriberId: string;
}

/**
 * Resolves all push-eligible recipients for a chat channel, excluding the sender.
 */
async function getChatChannelRecipients(
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
    },
  });
  if (!channel) return [];

  const recipients: ChatPushRecipient[] = [];

  if (channel.channelType === 'INSTALLATION' && channel.installationId) {
    // Guards assigned to this installation
    const guards = await prisma.opsAsignacionGuardia.findMany({
      where: { tenantId, installationId: channel.installationId, isActive: true },
      select: { guardiaId: true },
      distinct: ['guardiaId'],
    });
    for (const g of guards) {
      recipients.push({ subscriberType: 'GUARD', subscriberId: g.guardiaId });
    }

    // Contacts linked to this installation's account
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

    // Admins who have participated (have a read cursor)
    const adminCursors = await prisma.chatReadCursor.findMany({
      where: { channelId, readerType: 'ADMIN' },
      select: { readerId: true },
      distinct: ['readerId'],
    });
    for (const c of adminCursors) {
      recipients.push({ subscriberType: 'ADMIN', subscriberId: c.readerId });
    }
  } else if (channel.channelType === 'GROUP' && channel.groupId) {
    // All group members (admins only)
    const members = await prisma.adminGroupMembership.findMany({
      where: { groupId: channel.groupId },
      select: { adminId: true },
    });
    for (const m of members) {
      recipients.push({ subscriberType: 'ADMIN', subscriberId: m.adminId });
    }
  } else if (channel.channelType === 'DIRECT') {
    // DM participants (admins only for now)
    const participants = await prisma.chatDmParticipant.findMany({
      where: { channelId },
      select: { adminId: true },
    });
    for (const p of participants) {
      recipients.push({ subscriberType: 'ADMIN', subscriberId: p.adminId });
    }
  }

  // Exclude sender
  return recipients.filter(
    (r) => !(r.subscriberType === senderType && r.subscriberId === senderId)
  );
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

interface SendChatPushParams {
  tenantId: string;
  channelId: string;
  channelName: string;
  senderType: string;  // 'ADMIN' | 'GUARD' | 'CLIENT'
  senderId: string;
  senderName: string;
  messagePreview: string;
}

/**
 * Send push notifications to all eligible recipients of a chat channel message.
 * Respects per-channel notification preferences (ALL, MENTIONS_ONLY, MUTED).
 * Non-blocking — all errors are swallowed to avoid affecting message delivery.
 */
export async function sendChatPushNotifications({
  tenantId,
  channelId,
  channelName,
  senderType,
  senderId,
  senderName,
  messagePreview,
}: SendChatPushParams): Promise<void> {
  try {
    const recipients = await getChatChannelRecipients(channelId, tenantId, senderType, senderId);
    if (recipients.length === 0) return;

    // Fetch per-channel notification preferences for all recipients at once
    const prefs = await prisma.chatNotificationPreference.findMany({
      where: { channelId },
      select: { userType: true, userId: true, preference: true },
    });
    const prefMap = new Map(prefs.map((p) => [`${p.userType}:${p.userId}`, p.preference]));

    const body = messagePreview.length > 120
      ? messagePreview.slice(0, 120) + '…'
      : messagePreview;

    await Promise.allSettled(
      recipients.map((r) => {
        // Check per-channel preference: MUTED users get no push
        const pref = prefMap.get(`${r.subscriberType}:${r.subscriberId}`) || 'ALL';
        if (pref === 'MUTED') return Promise.resolve();

        const userType = SUBSCRIBER_TYPE_TO_USER[r.subscriberType];
        const portalType = SUBSCRIBER_TYPE_TO_PORTAL[r.subscriberType];
        if (!userType || !portalType) return Promise.resolve();

        return sendPushToPortalUser({
          tenantId,
          notifKey: 'chat_message',
          userType,
          userId: r.subscriberId,
          portalType,
          title: `${senderName} · ${channelName}`,
          body,
          url: portalType === 'app'
            ? `/opai/chat?channel=${channelId}`
            : `/portal/${portalType}/chat?channel=${channelId}`,
          tag: `chat-${channelId}`,
        });
      })
    );
  } catch (err) {
    console.error('[push] sendChatPushNotifications error:', err);
  }
}
