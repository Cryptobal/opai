# Push Notifications Sprint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix push notification reliability (fire-and-forget → `after()`), reduce server latency (batch badge counts), fix portal rondas URL routing, and add real-time in-app toasts.

**Architecture:** 4 independent backend+frontend changes to the push notification system. Tasks 1-3 are purely server-side. Task 4 adds a Pusher per-user channel for in-app toasts via Sonner, with real-time unread count updates in ChatFloatingProvider.

**Tech Stack:** Next.js 15.4.11 (`after()` from `next/server`), Prisma (raw SQL for batch), Pusher (private channels), Sonner (toasts), web-push.

---

## Task 1: Replace fire-and-forget with `after()` in 3 message API routes

**Files:**
- Modify: `src/app/api/chat/channels/[id]/messages/route.ts:395-427`
- Modify: `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts:300-322`
- Modify: `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts:300-322`

### Step 1: Modify admin message route

In `src/app/api/chat/channels/[id]/messages/route.ts`:

Add import at top (line 7):
```ts
import { after } from "next/server";
```

Replace lines 395-429 (the fire-and-forget block + return) with:

```ts
    // Schedule non-blocking work AFTER the response is sent.
    // Vercel guarantees after() runs to completion (unlike fire-and-forget).
    after(async () => {
      // 1. Pusher real-time event
      try {
        const eventName = threadRootId ? "thread-reply" : "new-message";
        const eventData = threadRootId
          ? { threadRootId, message: responseData }
          : responseData;
        await triggerChatEvent(channelId, eventName, eventData);
      } catch (err) {
        console.error("[PUSHER] Error triggering chat event:", err);
      }

      // 2. Push notifications
      try {
        const mentionedUserIds = parsedMentions
          .map((m) => (m.type === "ALL" ? "todos" : m.userId!))
          .filter(Boolean);
        const firstImageAttachment = attachments?.find(
          (a: any) =>
            a.type?.startsWith("image/") || a.contentType?.startsWith("image/")
        );

        await sendChatPushNotifications({
          tenantId: ctx.tenantId,
          channelId,
          channelName: channel.name,
          channelType: channel.channelType,
          senderType: "ADMIN",
          senderId: ctx.userId,
          senderName,
          messagePreview: content || "[Archivo adjunto]",
          mentionedUserIds:
            mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          imageUrl: firstImageAttachment?.url || undefined,
          timestamp: message.createdAt.getTime(),
        });
      } catch (err) {
        console.error("[PUSH] Error sending chat push notifications:", err);
      }
    });

    return NextResponse.json({ success: true, data: responseData });
```

Note: The `mentionedUserIds` and `firstImageAttachment` calculations must move INSIDE the `after()` callback or be computed BEFORE it (they reference `parsedMentions` and `attachments` which are in scope). Since they use local variables that are captured by closure, keeping them inside `after()` is fine.

### Step 2: Modify guardia message route

In `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts`:

Add import at top (after line 5):
```ts
import { after } from "next/server";
```

Replace lines 300-322 (fire-and-forget block + return) with:

```ts
    // Schedule non-blocking work AFTER the response is sent
    after(async () => {
      // 1. Pusher real-time event
      try {
        await triggerChatEvent(channelId, "new-message", responseData);
      } catch (err) {
        console.error("[Portal Guardia][PUSHER] Error triggering event:", err);
      }

      // 2. Push notifications
      try {
        const ch = await prisma.chatChannel.findUnique({
          where: { id: channelId },
          select: { name: true, channelType: true },
        });
        await sendChatPushNotifications({
          tenantId: session.tenantId,
          channelId,
          channelName: ch?.name || "Chat",
          channelType: ch?.channelType,
          senderType: "GUARD",
          senderId: session.guardiaId,
          senderName: session.guardiaName,
          messagePreview: content || "[Archivo adjunto]",
          timestamp: message.createdAt.getTime(),
        });
      } catch (err) {
        console.error("[Portal Guardia][PUSH] Error sending push:", err);
      }
    });

    return NextResponse.json({ success: true, data: responseData });
```

### Step 3: Modify cliente message route

In `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts`:

Add import at top (after line 5):
```ts
import { after } from "next/server";
```

Replace lines 300-322 (fire-and-forget block + return) with:

```ts
    // Schedule non-blocking work AFTER the response is sent
    after(async () => {
      // 1. Pusher real-time event
      try {
        await triggerChatEvent(channelId, "new-message", responseData);
      } catch (err) {
        console.error("[Portal Cliente][PUSHER] Error triggering event:", err);
      }

      // 2. Push notifications
      try {
        const ch = await prisma.chatChannel.findUnique({
          where: { id: channelId },
          select: { name: true, channelType: true },
        });
        await sendChatPushNotifications({
          tenantId: session.tenantId,
          channelId,
          channelName: ch?.name || "Chat",
          channelType: ch?.channelType,
          senderType: "CLIENT",
          senderId: session.contactId,
          senderName: session.contactName,
          messagePreview: content || "[Archivo adjunto]",
          timestamp: message.createdAt.getTime(),
        });
      } catch (err) {
        console.error("[Portal Cliente][PUSH] Error sending push:", err);
      }
    });

    return NextResponse.json({ success: true, data: responseData });
```

### Step 4: Verify build

Run: `npx next build 2>&1 | head -50`

Expected: Build succeeds without type errors on the 3 modified routes.

### Step 5: Commit

```bash
git add src/app/api/chat/channels/\[id\]/messages/route.ts \
  src/app/api/portal/guardia/chat/channels/\[id\]/messages/route.ts \
  src/app/api/portal/cliente/chat/channels/\[id\]/messages/route.ts
git commit -m "feat(push): replace fire-and-forget with after() in 3 message routes

Wraps Pusher trigger and sendChatPushNotifications() in Next.js after()
to guarantee execution after response. Prevents lost push notifications
when Vercel kills the function after sending the HTTP response."
```

---

## Task 2: Batch `calculateBadgeCount()` + payload improvements

**Files:**
- Modify: `src/lib/pwa/push-service.ts:63-102` (new batch function)
- Modify: `src/lib/pwa/push-service.ts:465-524` (use batch in sendChatPushNotifications)

### Step 1: Add `batchCalculateBadgeCounts()` function

In `src/lib/pwa/push-service.ts`, add this function AFTER `calculateBadgeCount()` (after line 102):

```ts
/**
 * Calculate badge counts for multiple recipients in 2 batch queries
 * instead of N×3 individual queries.
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

    // 2. For each user, batch their unread counts using existing batchUnreadCounts
    // This is N users × 1 query each, but batchUnreadCounts is already efficient
    // (single SQL per user). Total: N queries instead of N×3.
    await Promise.all(
      recipients.map(async (r) => {
        const key = `${r.subscriberType}:${r.subscriberId}`;
        const channelIds = channelsByUser.get(key) || [];
        let chatUnreads = 0;

        if (channelIds.length > 0) {
          const unreads = await batchUnreadCounts(
            channelIds,
            r.subscriberType,
            r.subscriberId,
            true,
          );
          for (const count of unreads.values()) chatUnreads += count;
        }

        // Bell notification unreads (admin only)
        let bellUnreads = 0;
        if (r.subscriberType === 'ADMIN') {
          const bellResult = await prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) AS count FROM notifications
            WHERE recipient_id = ${r.subscriberId}
              AND tenant_id = ${tenantId}
              AND read = false
          `;
          bellUnreads = Number(bellResult[0]?.count ?? 0);
        }

        badgeCounts.set(key, chatUnreads + bellUnreads);
      }),
    );
  } catch (err) {
    console.error('[push] Error batch calculating badge counts:', err);
    // On error, return empty map — callers use fallback of 1
  }

  return badgeCounts;
}
```

Add the import for `batchUnreadCounts` — it's already imported at line 3:
```ts
import { batchUnreadCounts } from '@/lib/chat';
```
(Already present, no change needed.)

### Step 2: Use batch in `sendChatPushNotifications()`

In the same file, modify `sendChatPushNotifications()`:

**Before** the `Promise.allSettled` block (around line 463), add:

```ts
    // Batch-calculate badge counts for all recipients at once
    const badgeCounts = await batchCalculateBadgeCounts(recipients, tenantId);
```

**Inside** the `recipients.map(async (r) => { ... })` block, replace line 493:
```ts
        // OLD: const badgeCount = await calculateBadgeCount(tenantId, userType, r.subscriberId);
        // NEW: Use pre-calculated batch badge count
        const badgeCount = badgeCounts.get(`${r.subscriberType}:${r.subscriberId}`) || 1;
```

### Step 3: Verify build

Run: `npx next build 2>&1 | head -50`

Expected: Build succeeds. `calculateBadgeCount` is still used by `sendPushToPortalUser` (line 193) so do NOT delete it.

### Step 4: Commit

```bash
git add src/lib/pwa/push-service.ts
git commit -m "perf(push): batch badge count calculation for all recipients

Replaces N×3 individual queries with batch approach. Pre-calculates
badge counts for all recipients before the Promise.allSettled loop.
Also preserves bell notification count for admin users."
```

---

## Task 3: Add `portalType` to `ChatPushSubscription` + fix URL routing

**Files:**
- Modify: `prisma/schema.prisma:5840-5857`
- Modify: `src/app/api/notifications/push/subscribe/route.ts:45-61`
- Modify: `src/lib/pwa/push-service.ts:370-374,488-497`

### Step 1: Add portalType field to schema

In `prisma/schema.prisma`, inside the `ChatPushSubscription` model (line 5840), add `portalType` after `userAgent`:

```prisma
  portalType   String?        @map("portal_type")
```

The model should look like:
```prisma
model ChatPushSubscription {
  id             String         @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String         @map("tenant_id")
  subscriberType ChatSenderType @map("subscriber_type")
  subscriberId   String         @map("subscriber_id")
  endpoint       String         @db.Text
  p256dh         String         @map("p256dh") @db.Text
  auth           String         @db.Text
  userAgent      String?        @map("user_agent")
  portalType     String?        @map("portal_type")
  isActive       Boolean        @default(true) @map("is_active")
  createdAt      DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([endpoint], map: "uq_chat_push_subscription_endpoint")
  @@index([tenantId, subscriberType, subscriberId], map: "idx_chat_push_subscriptions_subscriber")
  @@map("push_subscriptions")
  @@schema("chat")
}
```

### Step 2: Create migration

Run:
```bash
npx prisma migrate dev --name add_portal_type_to_push_subscriptions
```

Expected: Migration creates `ALTER TABLE chat.push_subscriptions ADD COLUMN portal_type TEXT;`

### Step 3: Save portalType in subscribe route

In `src/app/api/notifications/push/subscribe/route.ts`, modify the upsert (lines 45-61):

```ts
    await prisma.chatPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
        portalType: portalType,
      },
      create: {
        tenantId,
        subscriberType: subscriberType as any,
        subscriberId: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
        portalType: portalType,
      },
    });
```

### Step 4: Use portalType for URL routing in push-service

In `src/lib/pwa/push-service.ts`, add a helper function (replace the `SUBSCRIBER_TYPE_TO_PORTAL` usage at lines 370-374):

```ts
function getNotificationClickUrl(
  portalType: string | null | undefined,
  subscriberType: string,
  channelId: string,
): string {
  // Prioritize portalType from subscription (more precise)
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
      case 'supervisor':
        return `/portal/supervisor?section=chat&channel=${channelId}`;
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
```

Then modify the payload construction inside `sendChatPushNotifications()`. Currently (lines 488-497), the URL is computed per-recipient using `SUBSCRIBER_TYPE_TO_PORTAL`. Since each recipient may have MULTIPLE subscriptions (one per device/portal), the URL must be per-subscription, not per-recipient.

Restructure the inner loop: instead of building one payload per recipient, build one payload per subscription:

Replace lines 488-522 (inside the `recipients.map(async (r) => { ... })` callback):

```ts
        // Get pre-fetched subscriptions for this user
        const userSubs = subsByUser.get(`${r.subscriberType}:${r.subscriberId}`);
        if (!userSubs || userSubs.length === 0) return;

        const badgeCount = badgeCounts.get(`${r.subscriberType}:${r.subscriberId}`) || 1;

        // Send to each subscription with portal-specific URL
        await Promise.allSettled(
          userSubs.map((sub) => {
            const url = getNotificationClickUrl(sub.portalType, r.subscriberType, channelId);
            const payload = JSON.stringify({
              title: `\uD83D\uDCAC ${channelName}`,
              body: `${senderName}: ${body}`,
              icon: '/iconos_azul/icon-192x192.png',
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
```

This means the payload is now per-subscription (each gets its own URL based on `sub.portalType`).

### Step 5: Backfill existing subscriptions (optional SQL)

Create a one-time migration or run manually:
```sql
UPDATE chat.push_subscriptions SET portal_type = 'app' WHERE subscriber_type = 'ADMIN' AND portal_type IS NULL;
UPDATE chat.push_subscriptions SET portal_type = 'guardia' WHERE subscriber_type = 'GUARD' AND portal_type IS NULL;
UPDATE chat.push_subscriptions SET portal_type = 'cliente' WHERE subscriber_type = 'CLIENT' AND portal_type IS NULL;
```

Note: This won't distinguish rondas guards from regular guards for existing subscriptions, but the fallback handles that. Next re-subscription from Portal Rondas will store `portal_type = 'rondas'` correctly.

### Step 6: Verify build

Run: `npx prisma generate && npx next build 2>&1 | head -50`

Expected: Build succeeds. Prisma client includes `portalType` on `ChatPushSubscription`.

### Step 7: Commit

```bash
git add prisma/schema.prisma prisma/migrations/ \
  src/app/api/notifications/push/subscribe/route.ts \
  src/lib/pwa/push-service.ts
git commit -m "feat(push): add portalType to push subscriptions for correct URL routing

Adds portal_type column to chat.push_subscriptions. Saves portalType
when subscribing. Uses portalType to generate per-subscription click URLs,
fixing rondas guards being sent to /portal/guardia instead of /portal/rondas."
```

---

## Task 4: In-app toast with Sonner + Pusher per-user channel + real-time unread

**Files:**
- Create: `src/components/notifications/InAppNotificationProvider.tsx`
- Create: `src/components/notifications/ChatToast.tsx`
- Modify: `src/app/api/chat/channels/[id]/messages/route.ts` (inside after())
- Modify: `src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts` (inside after())
- Modify: `src/app/api/portal/cliente/chat/channels/[id]/messages/route.ts` (inside after())
- Modify: `src/app/api/chat/pusher/auth/route.ts` (authorize private-user channels)
- Modify: `src/app/api/portal/guardia/chat/pusher/auth/route.ts` (authorize private-user channels)
- Modify: `src/app/api/portal/cliente/chat/pusher/auth/route.ts` (authorize private-user channels)
- Modify: `src/lib/chat.ts` (add authorizePrivateChannel helper)
- Modify: `src/components/opai/AppLayoutClient.tsx` (mount provider)
- Modify: `src/components/chat/ChatFloatingProvider.tsx` (real-time unread increment)

### Step 1: Add private channel authorization helper to chat.ts

In `src/lib/chat.ts`, add after `authorizePusherChannel` (after line 77):

```ts
/**
 * Authorize a Pusher private channel (non-presence).
 * Used for per-user notification channels: private-user-{tenantId}-{type}-{userId}
 */
export function authorizePrivateChannel(socketId: string, channelName: string) {
  const pusher = getPusher();
  return pusher.authorizeChannel(socketId, channelName);
}
```

### Step 2: Update Pusher auth routes to authorize private-user channels

**Admin auth** — `src/app/api/chat/pusher/auth/route.ts`:

After line 42 (the `presence-chat-` match check), add a block BEFORE it to handle private-user channels:

```ts
    // Handle private-user notification channels
    const privateUserMatch = channelName.match(
      /^private-user-(.+)-(ADMIN|GUARD|CLIENT)-(.+)$/
    );
    if (privateUserMatch) {
      const [, channelTenantId, , channelUserId] = privateUserMatch;
      // Verify the requesting user owns this channel
      if (channelTenantId === ctx.tenantId && channelUserId === ctx.userId) {
        const { authorizePrivateChannel } = await import("@/lib/chat");
        const authResponse = authorizePrivateChannel(socketId, channelName);
        return NextResponse.json(authResponse);
      }
      return NextResponse.json(
        { success: false, error: "No autorizado para este canal" },
        { status: 403 }
      );
    }
```

**Guard auth** — `src/app/api/portal/guardia/chat/pusher/auth/route.ts`:

After line 45 (the `presence-chat-` match check), add BEFORE it:

```ts
    // Handle private-user notification channels
    const privateUserMatch = channelName.match(
      /^private-user-(.+)-(ADMIN|GUARD|CLIENT)-(.+)$/
    );
    if (privateUserMatch) {
      const [, channelTenantId, , channelUserId] = privateUserMatch;
      if (channelTenantId === session.tenantId && channelUserId === session.guardiaId) {
        const { authorizePrivateChannel } = await import("@/lib/chat");
        const authResponse = authorizePrivateChannel(socketId, channelName);
        return NextResponse.json(authResponse);
      }
      return NextResponse.json(
        { success: false, error: "No autorizado para este canal" },
        { status: 403 }
      );
    }
```

**Client auth** — `src/app/api/portal/cliente/chat/pusher/auth/route.ts`:

Same pattern, after line 45:

```ts
    // Handle private-user notification channels
    const privateUserMatch = channelName.match(
      /^private-user-(.+)-(ADMIN|GUARD|CLIENT)-(.+)$/
    );
    if (privateUserMatch) {
      const [, channelTenantId, , channelUserId] = privateUserMatch;
      if (channelTenantId === session.tenantId && channelUserId === session.contactId) {
        const { authorizePrivateChannel } = await import("@/lib/chat");
        const authResponse = authorizePrivateChannel(socketId, channelName);
        return NextResponse.json(authResponse);
      }
      return NextResponse.json(
        { success: false, error: "No autorizado para este canal" },
        { status: 403 }
      );
    }
```

### Step 3: Add Pusher per-user trigger in message routes

In the `after()` block of each message route (added in Task 1), add a 3rd section for in-app notifications.

Add to `src/lib/pwa/push-service.ts` a new exported function:

```ts
/**
 * Get chat channel recipients for in-app notification triggering.
 * Re-exports getChatChannelRecipients for use in API routes.
 */
export { getChatChannelRecipients };
```

Wait — `getChatChannelRecipients` is already a module-level function but NOT exported. Add `export` to it. Change line 281:
```ts
// FROM:
async function getChatChannelRecipients(
// TO:
export async function getChatChannelRecipients(
```

Then in each message route's `after()` block, add after the push notifications section:

**Admin route** (`src/app/api/chat/channels/[id]/messages/route.ts`):

Add import:
```ts
import { sendChatPushNotifications, getChatChannelRecipients } from "@/lib/pwa/push-service";
import { getPusherServer } from "@/lib/chat";
```

Add inside `after()`, after the push notifications try/catch:

```ts
      // 3. In-app notifications via Pusher per-user channel
      try {
        const recipients = await getChatChannelRecipients(
          channelId,
          ctx.tenantId,
          "ADMIN",
          ctx.userId,
        );
        if (recipients.length > 0) {
          const pusher = getPusherServer();
          const batchEvents = recipients.map((r) => ({
            channel: `private-user-${ctx.tenantId}-${r.subscriberType}-${r.subscriberId}`,
            name: "in-app-notification",
            data: JSON.stringify({
              type: "chat_message",
              channelId,
              channelName: channel.name,
              senderName,
              messagePreview: (content || "[Archivo adjunto]").substring(0, 120),
              timestamp: new Date().toISOString(),
            }),
          }));
          // Pusher triggerBatch accepts max 10 events per call
          for (let i = 0; i < batchEvents.length; i += 10) {
            await pusher.triggerBatch(batchEvents.slice(i, i + 10));
          }
        }
      } catch (err) {
        console.error("[PUSHER] Error sending in-app notifications:", err);
      }
```

**Guard route** (`src/app/api/portal/guardia/chat/channels/[id]/messages/route.ts`):

Add imports:
```ts
import { sendChatPushNotifications, getChatChannelRecipients } from "@/lib/pwa/push-service";
import { getPusherServer } from "@/lib/chat";
```

Add inside `after()`, after push section:

```ts
      // 3. In-app notifications via Pusher per-user channel
      try {
        const recipients = await getChatChannelRecipients(
          channelId,
          session.tenantId,
          "GUARD",
          session.guardiaId,
        );
        if (recipients.length > 0) {
          const pusher = getPusherServer();
          const chName = ch?.name || "Chat";
          const batchEvents = recipients.map((r) => ({
            channel: `private-user-${session.tenantId}-${r.subscriberType}-${r.subscriberId}`,
            name: "in-app-notification",
            data: JSON.stringify({
              type: "chat_message",
              channelId,
              channelName: chName,
              senderName: session.guardiaName,
              messagePreview: (content || "[Archivo adjunto]").substring(0, 120),
              timestamp: new Date().toISOString(),
            }),
          }));
          for (let i = 0; i < batchEvents.length; i += 10) {
            await pusher.triggerBatch(batchEvents.slice(i, i + 10));
          }
        }
      } catch (err) {
        console.error("[Portal Guardia][PUSHER] Error in-app notifications:", err);
      }
```

**Client route** — same pattern with `session.contactId`, `"CLIENT"`, `session.contactName`.

### Step 4: Create ChatToast component

Create `src/components/notifications/ChatToast.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, X } from "lucide-react";

interface ChatToastProps {
  channelName: string;
  senderName?: string;
  messagePreview?: string;
  messageCount?: number;
  channelId: string;
  toastId: string | number;
  chatUrl?: string;
}

export function ChatToast({
  channelName,
  senderName,
  messagePreview,
  messageCount,
  channelId,
  toastId,
  chatUrl,
}: ChatToastProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => {
        toast.dismiss(toastId);
        router.push(chatUrl || `/chat?channel=${channelId}`);
      }}
      className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg shadow-lg cursor-pointer hover:bg-accent/50 transition-colors w-80"
    >
      <div className="flex-shrink-0 mt-0.5">
        <MessageSquare className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {channelName}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {messageCount
            ? `${messageCount} mensajes nuevos`
            : senderName && messagePreview
              ? `${senderName}: ${messagePreview}`
              : senderName || "Nuevo mensaje"}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(toastId);
        }}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

### Step 5: Create InAppNotificationProvider

Create `src/components/notifications/InAppNotificationProvider.tsx`:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ChatToast } from "./ChatToast";

interface InAppNotification {
  type: "chat_message";
  channelId: string;
  channelName: string;
  senderName: string;
  messagePreview: string;
  timestamp: string;
}

interface Props {
  children: React.ReactNode;
  pusherKey: string;
  pusherCluster: string;
  pusherAuthEndpoint: string;
  tenantId: string;
  userType: "ADMIN" | "GUARD" | "CLIENT";
  userId: string;
  chatUrlPrefix?: string;
  onUnreadIncrement?: (channelId: string) => void;
}

export function InAppNotificationProvider({
  children,
  pusherKey,
  pusherCluster,
  pusherAuthEndpoint,
  tenantId,
  userType,
  userId,
  chatUrlPrefix = "/chat",
  onUnreadIncrement,
}: Props) {
  const bufferRef = useRef<
    Map<string, { count: number; lastSender: string; channelName: string; preview: string }>
  >(new Map());
  const timerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const onUnreadIncrementRef = useRef(onUnreadIncrement);
  onUnreadIncrementRef.current = onUnreadIncrement;

  const handleNotification = useCallback(
    (data: InAppNotification) => {
      // Don't show toast if user is viewing that channel
      const activeChannelId =
        typeof window !== "undefined"
          ? (window as any).__activeChatChannelId
          : null;
      if (data.channelId === activeChannelId) return;

      // Don't show toast if tab is hidden (OS push handles it)
      if (typeof document !== "undefined" && document.hidden) return;

      // Increment unread count in real-time
      onUnreadIncrementRef.current?.(data.channelId);

      // Buffer rapid messages from same channel
      const buffer = bufferRef.current;
      const existing = buffer.get(data.channelId);

      if (existing) {
        existing.count++;
        existing.lastSender = data.senderName;
        existing.preview = data.messagePreview;
        return; // Flush timer already running
      }

      buffer.set(data.channelId, {
        count: 1,
        lastSender: data.senderName,
        channelName: data.channelName,
        preview: data.messagePreview,
      });

      const timer = setTimeout(() => {
        const info = buffer.get(data.channelId);
        if (!info) return;
        buffer.delete(data.channelId);
        timerRef.current.delete(data.channelId);

        const chatUrl =
          chatUrlPrefix === "/chat"
            ? `/chat?channel=${data.channelId}`
            : `${chatUrlPrefix}?section=chat&channel=${data.channelId}`;

        toast.custom(
          (t) => (
            <ChatToast
              channelName={info.channelName}
              senderName={info.count === 1 ? info.lastSender : undefined}
              messagePreview={info.count === 1 ? info.preview : undefined}
              messageCount={info.count > 1 ? info.count : undefined}
              channelId={data.channelId}
              toastId={t}
              chatUrl={chatUrl}
            />
          ),
          { duration: 6000, position: "top-right" },
        );
      }, 1500);

      timerRef.current.set(data.channelId, timer);
    },
    [chatUrlPrefix],
  );

  useEffect(() => {
    if (!tenantId || !userId) return;

    let pusherInstance: any = null;
    let channel: any = null;

    // Dynamic import to avoid SSR issues
    import("pusher-js").then((PusherModule) => {
      const Pusher = PusherModule.default;
      pusherInstance = new Pusher(pusherKey, {
        cluster: pusherCluster,
        authEndpoint: pusherAuthEndpoint,
      });

      const channelName = `private-user-${tenantId}-${userType}-${userId}`;
      channel = pusherInstance.subscribe(channelName);
      channel.bind("in-app-notification", handleNotification);
    });

    return () => {
      if (channel) {
        channel.unbind("in-app-notification", handleNotification);
      }
      if (pusherInstance) {
        pusherInstance.disconnect();
      }
      timerRef.current.forEach((t) => clearTimeout(t));
      timerRef.current.clear();
      bufferRef.current.clear();
    };
  }, [tenantId, userId, userType, pusherKey, pusherCluster, pusherAuthEndpoint, handleNotification]);

  return <>{children}</>;
}
```

### Step 6: Mount provider in AppLayoutClient

In `src/components/opai/AppLayoutClient.tsx`, add import:

```ts
import { InAppNotificationProvider } from "@/components/notifications/InAppNotificationProvider";
```

Wrap the existing `ChatFloatingProvider` (around line 252) with the new provider:

```tsx
    <InAppNotificationProvider
      pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY!}
      pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER!}
      pusherAuthEndpoint="/api/chat/pusher/auth"
      tenantId={tenantId ?? ""}
      userType="ADMIN"
      userId={currentUserId ?? ""}
      chatUrlPrefix="/chat"
    >
      <ChatFloatingProvider currentUserId={currentUserId ?? ""} userRole={userRole}>
        {/* ...existing content... */}
      </ChatFloatingProvider>
    </InAppNotificationProvider>
```

For portal layouts, the provider needs to be mounted in each portal's layout or page component with the appropriate props:
- Guard portal: `userType="GUARD"`, `chatUrlPrefix="/portal/guardia"`, `pusherAuthEndpoint="/api/portal/guardia/chat/pusher/auth"`
- Client portal: `userType="CLIENT"`, `chatUrlPrefix="/portal/cliente"`, `pusherAuthEndpoint="/api/portal/cliente/chat/pusher/auth"`
- Rondas portal: `userType="GUARD"`, `chatUrlPrefix="/portal/rondas"`, `pusherAuthEndpoint="/api/portal/guardia/chat/pusher/auth"`

Portal mounting is lower priority — start with admin OPAI and add portals later if needed.

### Step 7: Add real-time unread increment to ChatFloatingProvider

In `src/components/chat/ChatFloatingProvider.tsx`, expose a method for the InAppNotificationProvider to call:

Add to the global window object (after line 201):

```ts
    // Expose unread increment for InAppNotificationProvider
    if (typeof window !== 'undefined') {
      (window as any).__incrementChatUnread = (channelId: string) => {
        setChannels(prev =>
          prev.map(ch =>
            ch.id === channelId
              ? { ...ch, unreadCount: (ch.unreadCount || 0) + 1 }
              : ch
          )
        );
      };
    }
```

Then in `InAppNotificationProvider`, the `onUnreadIncrement` prop can be wired to this:

Actually, simpler approach — have InAppNotificationProvider call `window.__incrementChatUnread` directly:

In InAppNotificationProvider's `handleNotification`, replace the `onUnreadIncrementRef.current?.(data.channelId)` line with:

```ts
      // Increment unread count in ChatFloatingProvider
      if (typeof window !== "undefined" && (window as any).__incrementChatUnread) {
        (window as any).__incrementChatUnread(data.channelId);
      }
```

And remove the `onUnreadIncrement` prop entirely to keep it simple.

### Step 8: Verify build

Run: `npx next build 2>&1 | head -50`

Expected: Build succeeds.

### Step 9: Commit

```bash
git add src/components/notifications/InAppNotificationProvider.tsx \
  src/components/notifications/ChatToast.tsx \
  src/app/api/chat/pusher/auth/route.ts \
  src/app/api/portal/guardia/chat/pusher/auth/route.ts \
  src/app/api/portal/cliente/chat/pusher/auth/route.ts \
  src/lib/chat.ts \
  src/lib/pwa/push-service.ts \
  src/app/api/chat/channels/\[id\]/messages/route.ts \
  src/app/api/portal/guardia/chat/channels/\[id\]/messages/route.ts \
  src/app/api/portal/cliente/chat/channels/\[id\]/messages/route.ts \
  src/components/opai/AppLayoutClient.tsx \
  src/components/chat/ChatFloatingProvider.tsx
git commit -m "feat(push): add in-app toast notifications via Pusher per-user channel

Adds private-user Pusher channels for real-time in-app notifications.
Shows Sonner toasts when messages arrive in non-active channels.
Groups rapid messages. Increments sidebar unread counts instantly
instead of waiting for 30s polling."
```

---

## Final Build Verification

After all 4 tasks:

```bash
npx next build
```

Expected: Clean build with no type errors.

## Testing Checklist

- [ ] Send 20 messages rapidly from OPAI → all push notifications arrive
- [ ] Send from Portal Guardia → push arrives at admins
- [ ] Send from Portal Cliente → push arrives at admins and guards
- [ ] With 10 recipients, badge count queries are batched (check server logs)
- [ ] Guard on Portal Rondas → push click opens /portal/rondas
- [ ] Guard on Portal Guardias → push click opens /portal/guardia
- [ ] In OPAI, message in channel B while viewing A → toast appears < 2s
- [ ] Click toast → navigates to channel B
- [ ] Viewing channel B → no toast for channel B messages
- [ ] 5 rapid messages → single "5 mensajes nuevos" toast
- [ ] Sidebar unread count updates instantly (no 30s delay)
