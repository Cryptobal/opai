# Toast Notifications Upgrade + Push Audit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade in-app chat toast notifications to rich Slack-style design with sound, and fix the broken `pushsubscriptionchange` handler in the service worker + create a debug endpoint for push testing.

**Architecture:** The existing `InAppNotificationProvider` + `ChatToast` + sonner pipeline stays intact. We redesign the `ChatToast` component for rich visuals, adjust the sonner `<Toaster>` config for bottom-right positioning, add notification sound with debounce, fix the SW `pushsubscriptionchange` to persist user context, and add a temporary debug endpoint.

**Tech Stack:** React, sonner, Pusher, web-push, Next.js App Router, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-10-toast-notifications-push-audit-design.md`

---

## Chunk 1: Toast Visual Upgrade

### Task 1: Redesign ChatToast Component

**Files:**
- Modify: `src/components/notifications/ChatToast.tsx` (entire file)

- [ ] **Step 1: Read the current ChatToast component**

Read `src/components/notifications/ChatToast.tsx` to confirm the current interface and imports.

- [ ] **Step 2: Rewrite ChatToast with rich Slack-style design**

Replace the entire content of `src/components/notifications/ChatToast.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ChatToastProps {
  channelName: string;
  senderName?: string;
  messagePreview?: string;
  messageCount?: number;
  channelId: string;
  toastId: string | number;
  chatUrl?: string;
  isFile?: boolean;
}

/** Generate a deterministic color from a string (for avatar background). */
function avatarColor(name: string): string {
  const colors = [
    "bg-teal-600", "bg-blue-600", "bg-violet-600", "bg-rose-600",
    "bg-amber-600", "bg-emerald-600", "bg-cyan-600", "bg-pink-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials (first two chars of first two words, or first two chars). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ChatToast({
  channelName,
  senderName,
  messagePreview,
  messageCount,
  channelId,
  toastId,
  chatUrl,
  isFile,
}: ChatToastProps) {
  const router = useRouter();

  const displayPreview = isFile
    ? "\uD83D\uDCCE Envió un archivo"
    : messagePreview || "Nuevo mensaje";

  const hasSender = !!senderName;

  return (
    <div
      onClick={() => {
        toast.dismiss(toastId);
        router.push(chatUrl || `/chat?channel=${channelId}`);
      }}
      className="flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-white/[0.03] w-[360px] bg-[#0d1220] border border-white/[0.08] border-l-[3px] border-l-teal-400 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
    >
      {/* Avatar */}
      {hasSender && (
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold ${avatarColor(senderName!)}`}
        >
          {initials(senderName!)}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Sender + Channel */}
        {hasSender && (
          <>
            <p className="text-[13px] font-bold text-white truncate">
              {senderName}
            </p>
            <p className="text-[12px] text-teal-400 truncate">
              en # {channelName}
            </p>
          </>
        )}
        {!hasSender && (
          <p className="text-[13px] font-bold text-white truncate">
            # {channelName}
          </p>
        )}

        {/* Preview or count */}
        <p className="text-[13px] text-zinc-400 line-clamp-2 mt-0.5">
          {messageCount
            ? `${messageCount} mensajes nuevos`
            : displayPreview}
        </p>
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(toastId);
        }}
        className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 p-0.5 mt-0.5"
        aria-label="Cerrar notificación"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx next build --no-lint 2>&1 | tail -20`

If there are type errors, fix them. The key change is adding `isFile` prop.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/ChatToast.tsx
git commit -m "feat: redesign ChatToast with rich Slack-style visual design"
```

---

### Task 2: Update Toaster Config for Bottom-Right + Chat Toast Styling

**Files:**
- Modify: `src/components/ui/toaster.tsx`

The current `<Toaster>` uses `position="top-right"`. We need `position="bottom-right"` per the spec. The `visibleToasts={3}` is already set.

- [ ] **Step 1: Update toaster position**

In `src/components/ui/toaster.tsx`, change `position="top-right"` to `position="bottom-right"`. The `visibleToasts={3}` is already correct. The `toastOptions.className` only applies to default toasts (success, error), not `toast.custom()`, so no changes needed there.

```tsx
/**
 * Global toast host (Sonner) — Dark theme
 */
"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      richColors
      position="bottom-right"
      closeButton
      expand={false}
      visibleToasts={3}
      duration={4000}
      toastOptions={{
        className: "!bg-card !border-border !text-foreground",
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/toaster.tsx
git commit -m "feat: move toast position to bottom-right"
```

---

### Task 3: Add File Detection and Sound to InAppNotificationProvider

**Files:**
- Modify: `src/components/notifications/InAppNotificationProvider.tsx`

Changes:
1. Detect file messages (content starts with `[Archivo adjunto]` or is empty with attachments indicator)
2. Play notification sound with 2s debounce
3. Pass `isFile` prop to ChatToast

- [ ] **Step 1: Update InAppNotificationProvider**

Replace the full content of `src/components/notifications/InAppNotificationProvider.tsx`:

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
}

/** Detect if the message preview indicates a file/attachment rather than text. */
function isFileMessage(preview: string): boolean {
  if (!preview) return false;
  const lower = preview.toLowerCase();
  return lower.startsWith("[archivo adjunto]");
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
}: Props) {
  const bufferRef = useRef<
    Map<
      string,
      { count: number; lastSender: string; channelName: string; preview: string; isFile: boolean }
    >
  >(new Map());
  const timerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastSoundRef = useRef<number>(0);

  const playSound = useCallback(() => {
    const now = Date.now();
    if (now - lastSoundRef.current < 2000) return;
    lastSoundRef.current = now;
    try {
      const audio = new Audio("/sounds/notification.mp3");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {
      // Sound not available or blocked
    }
  }, []);

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

      // Increment unread count in ChatFloatingProvider via window bridge
      if (typeof window !== "undefined" && (window as any).__incrementChatUnread) {
        (window as any).__incrementChatUnread(data.channelId);
      }

      const fileMsg = isFileMessage(data.messagePreview);

      // Buffer rapid messages from same channel
      const buffer = bufferRef.current;
      const existing = buffer.get(data.channelId);

      if (existing) {
        existing.count++;
        existing.lastSender = data.senderName;
        existing.preview = data.messagePreview;
        existing.isFile = fileMsg;
        return; // Flush timer already running
      }

      buffer.set(data.channelId, {
        count: 1,
        lastSender: data.senderName,
        channelName: data.channelName,
        preview: data.messagePreview,
        isFile: fileMsg,
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

        // Play sound (debounced)
        playSound();

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
              isFile={info.count === 1 ? info.isFile : false}
            />
          ),
          { duration: 5000, position: "bottom-right" },
        );
      }, 1500);

      timerRef.current.set(data.channelId, timer);
    },
    [chatUrlPrefix, playSound],
  );

  useEffect(() => {
    if (!tenantId || !userId) return;

    let pusherInstance: any = null;
    let channel: any = null;

    // Dynamic import to avoid SSR issues with pusher-js
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

- [ ] **Step 2: Add notification sound file**

We need a notification sound file at `public/sounds/notification.mp3`.

Option A: Generate a simple short beep/chime sound using a script or download a free CC0 notification sound.
Option B: If no sound file is available, the `audio.play().catch(() => {})` will silently fail and toasts will still work without sound.

For now, create the directory and add a placeholder note:

```bash
mkdir -p /Users/caco/Desktop/Cursor/opai/public/sounds
```

You can add a real notification sound file later. The code handles the missing file gracefully.

- [ ] **Step 3: Verify build**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/InAppNotificationProvider.tsx
git commit -m "feat: add sound notification, file detection, 5s duration to chat toasts"
```

---

## Chunk 2: Push Notification Audit Fixes

### Task 4: Fix pushsubscriptionchange Handler in Service Worker

**Files:**
- Modify: `public/sw.js` (lines 233-249 and add message handler)
- Modify: `src/lib/pwa/push-client.ts` (store context after subscribe)

The `pushsubscriptionchange` handler needs user context (userType, userId, tenantId, portalType) that it currently doesn't have. We'll store this in a Cache API entry when the user first subscribes, then read it back in the SW.

**CRITICAL:** The SW activate handler deletes all caches except `opai-v2`. We must also preserve the `push-context` cache, otherwise the stored context will be wiped on every SW update — exactly when `pushsubscriptionchange` fires.

- [ ] **Step 0: Preserve push-context cache in SW activate handler**

In `public/sw.js`, find the activate handler (line ~27-35):
```js
keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
```

Replace with:
```js
keys.filter((k) => k !== CACHE_NAME && k !== 'push-context').map((k) => caches.delete(k))
```

- [ ] **Step 1: Add STORE_PUSH_CONTEXT handler to sw.js**

In `public/sw.js`, in the existing `message` event listener (line 252-255), add handling for `STORE_PUSH_CONTEXT`:

Find this block:
```js
// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

Replace with:
```js
// Message handlers
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Store push subscription context for pushsubscriptionchange re-subscribe
  if (event.data?.type === 'STORE_PUSH_CONTEXT') {
    const ctx = event.data.context;
    if (ctx) {
      caches.open('push-context').then((cache) => {
        cache.put('/_push-context', new Response(JSON.stringify(ctx)));
      });
    }
  }
});
```

- [ ] **Step 2: Fix the pushsubscriptionchange handler in sw.js**

Find the current `pushsubscriptionchange` handler:
```js
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((newSub) =>
        fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        })
      )
      .catch((err) => console.error('[SW] pushsubscriptionchange failed:', err))
  );
});
```

Replace with:
```js
// PUSH SUBSCRIPTION CHANGE: re-subscribe automatically
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.pushManager
        .subscribe(event.oldSubscription?.options || { userVisibleOnly: true }),
      caches.open('push-context')
        .then((cache) => cache.match('/_push-context'))
        .then((res) => res ? res.json() : null)
        .catch(() => null),
    ])
      .then(([newSub, ctx]) => {
        if (!ctx) {
          console.warn('[SW] pushsubscriptionchange: no stored context, cannot re-subscribe');
          return;
        }
        return fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            portalType: ctx.portalType,
            userType: ctx.userType,
            userId: ctx.userId,
            tenantId: ctx.tenantId,
          }),
        });
      })
      .catch((err) => console.error('[SW] pushsubscriptionchange failed:', err))
  );
});
```

- [ ] **Step 3: Store push context after successful subscribe in push-client.ts**

In `src/lib/pwa/push-client.ts`, after the successful `fetch` to the subscribe endpoint (line 40-42), add a message to the SW to store context:

Find:
```ts
    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        portalType: params.portalType,
        userType: params.userType,
        userId: params.userId,
        tenantId: params.tenantId,
      }),
    });

    return res.ok;
```

Replace with:
```ts
    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        portalType: params.portalType,
        userType: params.userType,
        userId: params.userId,
        tenantId: params.tenantId,
      }),
    });

    // Store context in SW for pushsubscriptionchange re-subscribe
    if (res.ok && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STORE_PUSH_CONTEXT',
        context: {
          portalType: params.portalType,
          userType: params.userType,
          userId: params.userId,
          tenantId: params.tenantId,
        },
      });
    }

    return res.ok;
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/lib/pwa/push-client.ts
git commit -m "fix: store push context for pushsubscriptionchange re-subscribe"
```

---

### Task 5: Create Debug Push Notification Endpoint

**Files:**
- Create: `src/app/api/debug/test-push/route.ts`

- [ ] **Step 1: Create the debug endpoint**

Create `src/app/api/debug/test-push/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import webPush from "web-push";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Initialize VAPID
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "VAPID keys not configured" },
        { status: 500 },
      );
    }
    webPush.setVapidDetails(
      "mailto:soporte@gardsecurity.cl",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );

    // Note: only queries ADMIN subscriptions for the authenticated admin user.
    // Portal users (guardia, cliente) cannot call this endpoint.
    const subscriptions = await prisma.chatPushSubscription.findMany({
      where: {
        tenantId: ctx.tenantId,
        subscriberType: "ADMIN",
        subscriberId: ctx.userId,
        isActive: true,
      },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        total: 0,
        message: "No active push subscriptions found for this user",
        results: [],
      });
    }

    const payload = JSON.stringify({
      title: "Test Push OPAI",
      body: "Si ves esto, las push notifications funcionan!",
      icon: "/iconos_azul/icon-192x192.png",
      badge: "/iconos_azul/icon-72x72.png",
      tag: "test-push",
      data: { url: "/" },
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        ),
      ),
    );

    // Deactivate gone subscriptions
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        const err = r.reason as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.chatPushSubscription.update({
            where: { id: subscriptions[i].id },
            data: { isActive: false },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: subscriptions.length,
      results: results.map((r, i) => ({
        endpoint: subscriptions[i].endpoint.substring(0, 60) + "...",
        portalType: subscriptions[i].portalType,
        userAgent: subscriptions[i].userAgent?.substring(0, 80),
        status: r.status,
        statusCode:
          r.status === "fulfilled"
            ? 201
            : (r.reason as any)?.statusCode ?? "unknown",
        error:
          r.status === "rejected"
            ? (r.reason as any)?.message ?? "Unknown error"
            : null,
      })),
    });
  } catch (err: any) {
    console.error("[debug/test-push] Error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/caco/Desktop/Cursor/opai && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/debug/test-push/route.ts
git commit -m "feat: add temporary debug endpoint for testing push notifications"
```

---

## Chunk 3: Verification

### Task 6: Manual Verification Checklist

- [ ] **Step 1: Start dev server and verify toasts render**

Run: `cd /Users/caco/Desktop/Cursor/opai && npm run dev`

Open the app. Navigate to any page that is NOT `/chat`. Have another user (or use a second browser tab) send a chat message. Verify:
- Toast appears in bottom-right corner
- Avatar shows initials with colored background
- Sender name is bold, white
- Channel name is teal with `#` prefix
- Message preview shows 2 lines max
- Toast auto-dismisses after 5 seconds
- Clicking toast navigates to the channel
- X button dismisses only that toast

- [ ] **Step 2: Test push debug endpoint**

```bash
curl -X POST http://localhost:3000/api/debug/test-push \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json"
```

Or use the browser console:
```js
fetch('/api/debug/test-push', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Check the response:
- How many subscriptions?
- What endpoints? (Apple = `web.push.apple.com`, Google = `fcm.googleapis.com`, Mozilla = `updates.push.services.mozilla.com`)
- Status codes: 201 = success, 410 = expired, 403 = VAPID issue

- [ ] **Step 3: Verify pushsubscriptionchange context storage**

In browser DevTools console:
```js
// Check if push context is stored
caches.open('push-context').then(c => c.match('/_push-context')).then(r => r?.json()).then(console.log)
```

Should return `{ portalType, userType, userId, tenantId }` if the user has subscribed to push.

- [ ] **Step 4: Document results**

Create a brief report of what was verified, what worked, what didn't. If push notifications don't arrive on iOS, document the endpoint type (Apple vs. other) and any error codes from the debug endpoint.
