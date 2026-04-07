# Toast Notifications Upgrade + Push Notification Audit

## Overview

Two related improvements to OPAI's notification system:
1. Upgrade existing in-app chat toast notifications to match Slack-style rich design
2. Audit the push notification pipeline end-to-end, fix identified issues, create debug endpoint

## Current State

### Toast Notifications (Already Functional)

- `InAppNotificationProvider` subscribes to Pusher per-user channels, receives `in-app-notification` events
- `ChatToast` renders basic toast via sonner `toast.custom()`
- Provider mounted in `AppLayoutClient` — works on all OPAI pages
- Active channel suppression via `window.__activeChatChannelId`
- Tab-hidden check defers to OS push notifications
- Message buffering with 1.5s debounce per channel

### Push Notifications (Pipeline Complete)

Full pipeline: subscription → server send → service worker display → notification click.
All manifests have `display: standalone`. iOS detection works correctly.

## Part 1: Toast Notification Visual Upgrade

### Approach

Upgrade within sonner (Option A). No new toast library or custom container needed.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/notifications/ChatToast.tsx` | Complete visual redesign |
| `src/components/notifications/InAppNotificationProvider.tsx` | Sound, file detection, position config |
| Sonner `<Toaster>` component (find where mounted) | Position `bottom-right`, `visibleToasts: 3` |

### ChatToast Component Design

```
+---+--------------------------------------+
| ▌ | [AV]  Sender Name              [X]  |
| ▌ |        en # Channel Name            |
| ▌ |                                      |
| ▌ |  Message preview text up to two     |
| ▌ |  lines with ellipsis...             |
+---+--------------------------------------+
```

Styling:
- Background: `bg-[#0d1220]`, `border border-white/[0.08]`
- Left accent: `border-l-[3px] border-teal-400`
- Shadow: `shadow-[0_8px_24px_rgba(0,0,0,0.4)]`
- Border-radius: `rounded-xl` (12px)
- Max width: 360px
- Avatar: 36px, initials-based, `rounded-lg`
- Sender name: 13px, font-bold, text-primary
- Channel name: 12px, `text-teal-400`, `# ` prefix
- Preview: 13px, `text-muted-foreground`, `line-clamp-2`
- File detection: `[Archivo adjunto]` or attachments → "Envio un archivo"
- Close button: top-right corner, subtle

### Sound

- Play `/sounds/notification.mp3` on first toast in 2s window
- Debounce: skip if sound played within last 2000ms
- Use `new Audio()` API
- Respect system by catching play() errors silently

### Hover Behavior

Sonner's custom toasts pause auto-dismiss on hover by default. Verify this works; if not, use `onMouseEnter`/`onMouseLeave` with a timer ref.

### Stacking

Configure sonner `<Toaster>` with `visibleToasts={3}`. Sonner handles FIFO automatically.

### Position

Change sonner `<Toaster>` position from `top-right` to `bottom-right` for desktop.

## Part 2: Push Notification Audit

### Pipeline Status

| Checkpoint | Status | File |
|------------|--------|------|
| Manifests display:standalone | OK | All 5 manifest files |
| SW registered | OK | `src/lib/pwa/register-sw.ts` |
| Push permission via user gesture | OK | `src/components/pwa/PushPermissionPrompt.tsx` |
| userVisibleOnly: true | OK | `src/lib/pwa/push-client.ts:26` |
| VAPID keys configured | OK | env vars |
| Subscription saved to DB | OK | `/api/notifications/push/subscribe` |
| event.waitUntil(showNotification) | OK | `public/sw.js:163` |
| notificationclick handler | OK | `public/sw.js:176` |
| pushsubscriptionchange | BROKEN | `public/sw.js:233` |
| Expired subs cleaned (410) | OK | `src/lib/pwa/push-service.ts:193` |

### Issue: Broken pushsubscriptionchange Handler

`public/sw.js:233-249`: The `pushsubscriptionchange` handler POSTs to `/api/notifications/push/subscribe` but only sends `{ subscription, oldEndpoint }`. The subscribe endpoint requires `userType`, `userId`, `tenantId`, `portalType` — all missing. Result: **400 "Missing fields"**.

**Fix**: Store user context (userType, userId, tenantId, portalType) in a SW-accessible cache (e.g., Cache API with a special key) when the initial subscription succeeds. The `pushsubscriptionchange` handler reads this context and includes it in the re-subscribe request.

Implementation:
1. In `push-client.ts`: after successful subscribe, store context via `navigator.serviceWorker.controller.postMessage({ type: 'STORE_PUSH_CONTEXT', ... })`
2. In `sw.js`: listen for `STORE_PUSH_CONTEXT` message, save to Cache API as a JSON response
3. In `pushsubscriptionchange`: read cached context and include in the POST body

### Debug Endpoint

Create `POST /api/debug/test-push/route.ts`:
- Uses `requireAuth()` for session validation
- Finds all `ChatPushSubscription` for current user
- Sends test notification to each via `web-push`
- Returns: subscription count, endpoints (truncated), status per send, error details

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/app/api/debug/test-push/route.ts` | Create (temporary) |
| `public/sw.js` | Fix pushsubscriptionchange, add STORE_PUSH_CONTEXT handler |
| `src/lib/pwa/push-client.ts` | Store push context after successful subscribe |

## Implementation Order

1. Toast visual upgrade (ChatToast.tsx redesign)
2. Toast behavior (sound, Toaster config)
3. Push audit fixes (pushsubscriptionchange + context storage)
4. Debug endpoint
5. Verification
