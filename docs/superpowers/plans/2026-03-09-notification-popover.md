# Notification Popover Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NotificationBell dropdown and /notificaciones page with a single full-featured notification popover in the desktop/mobile topbar.

**Architecture:** Rewrite `NotificationBell.tsx` into a `NotificationPopover` using Radix Popover (instead of DropdownMenu) with filters (all/unread + module), inline reply for mentions, infinite scroll, and bulk actions. Add Chat + Notification buttons to the desktop topbar. Remove the /notificaciones page and sidebar link.

**Tech Stack:** React, Radix UI Popover, Tailwind CSS, existing `useNotifications()` context, existing UI components (Button, Badge, Select, Popover).

**Spec:** `docs/superpowers/specs/2026-03-09-notification-popover-design.md`

---

## Chunk 1: Extract shared utils + Build NotificationPopover

### Task 1: Extract shared notification utils

**Files:**
- Create: `src/lib/notification-ui-utils.ts`
- Modify: `src/components/opai/NotificationListClient.tsx` (lines 54–273)

Extract duplicated constants and functions into a shared util file that both the popover and the full page can use.

- [ ] **Step 1: Create `src/lib/notification-ui-utils.ts`**

Move these items from `NotificationListClient.tsx`:

```ts
// src/lib/notification-ui-utils.ts

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  seen?: boolean;
  link?: string | null;
  createdAt: string;
  sourceModule?: string;
  source_module?: string;
  sourceModuleLabel?: string;
  source_module_label?: string;
  sourceRecordName?: string | null;
  source_record_name?: string | null;
  isSystem?: boolean;
  is_system?: boolean;
}

export const TYPE_ICONS: Record<string, string> = {
  new_lead: "🔔",
  lead_approved: "✅",
  quote_sent: "📧",
  quote_viewed: "👁️",
  contract_required: "📝",
  contract_expiring: "⚠️",
  contract_expired: "🔴",
  guardia_doc_expiring: "🟠",
  guardia_doc_expired: "🔴",
  new_postulacion: "📋",
  document_signed_completed: "✅",
  email_opened: "👀",
  email_clicked: "🖱️",
  email_bounced: "⚠️",
  followup_sent: "📨",
  followup_scheduled: "⏰",
  followup_failed: "❌",
  mention: "💬",
  mention_direct: "📌",
  mention_group: "👥",
  note_thread_reply: "🧵",
  ticket_created: "🎫",
  ticket_approved: "✅",
  ticket_rejected: "❌",
  ticket_sla_breached: "🚨",
  ticket_sla_approaching: "⏳",
  refuerzo_solicitud_created: "📋",
};

export const TYPE_LABELS: Record<string, string> = {
  mention: "Mención",
  mention_direct: "Mención directa",
  mention_group: "Mención grupal",
  note_thread_reply: "Respuesta en hilo",
};

export const TYPE_MODULE_FALLBACK: Record<string, string> = {
  new_lead: "lead",
  lead_approved: "lead",
  mention: "crm",
  email_opened: "negocio",
  email_clicked: "negocio",
  email_bounced: "negocio",
  followup_sent: "negocio",
  followup_scheduled: "negocio",
  followup_failed: "negocio",
  quote_sent: "cotizacion",
  quote_viewed: "cotizacion",
  contract_required: "contrato",
  contract_expiring: "contrato",
  contract_expired: "contrato",
  document_signed_completed: "contrato",
  guardia_doc_expiring: "guardia",
  guardia_doc_expired: "guardia",
  new_postulacion: "guardia",
  refuerzo_solicitud_created: "operaciones",
  ticket_created: "operaciones",
  ticket_approved: "operaciones",
  ticket_rejected: "operaciones",
  ticket_sla_breached: "operaciones",
  ticket_sla_approaching: "operaciones",
  ticket_mention: "operaciones",
};

export const MODULE_LABELS: Record<string, string> = { /* same as NotificationListClient */ };
export const MODULE_BADGE_STYLES: Record<string, string> = { /* same */ };
export const MODULE_SORT_ORDER: string[] = [ /* same */ ];

export const NON_SYSTEM_TYPES = new Set(["mention", "ticket_mention"]);

// Functions
export function timeAgo(dateStr: string): string { /* same logic */ }
export function formatExactDate(dateStr: string): string { /* same */ }
// Internal helpers used by getModuleMeta — not exported, called internally only
function normalizeModuleKey(value: string | null | undefined): string | null { /* same */ }
function inferModuleFromType(type: string): string { /* same */ }

export function getModuleMeta(notification: NotificationItem) { /* same — calls normalizeModuleKey + inferModuleFromType internally */ }
export function getRecordName(notification: NotificationItem): string | null { /* same */ }
export function getContextLabel(notification: NotificationItem): string { /* same */ }
export function isSystemNotification(notification: NotificationItem): boolean { /* same */ }
```

Copy all the constants and function bodies verbatim from `NotificationListClient.tsx` lines 35–273.

- [ ] **Step 2: Update `NotificationListClient.tsx` to import from shared utils**

Replace the local definitions (lines 35–273) with imports:

```ts
import {
  type NotificationItem,
  TYPE_ICONS,
  TYPE_LABELS,
  TYPE_MODULE_FALLBACK,
  MODULE_LABELS,
  MODULE_BADGE_STYLES,
  MODULE_SORT_ORDER,
  NON_SYSTEM_TYPES,
  timeAgo,
  formatExactDate,
  getModuleMeta,
  getRecordName,
  getContextLabel,
  isSystemNotification,
} from "@/lib/notification-ui-utils";
```

Keep the component's local state and rendering logic unchanged. Remove the `NotificationItem` interface export from the component file (it now comes from the shared utils).

- [ ] **Step 3: Verify the app still compiles**

Run: `npx next build --no-lint 2>&1 | head -30` or check dev server for errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification-ui-utils.ts src/components/opai/NotificationListClient.tsx
git commit -m "refactor: extract shared notification UI utils"
```

---

### Task 2: Build NotificationPopover component

**Files:**
- Create: `src/components/opai/NotificationPopover.tsx`

Build the full-featured popover that replaces both `NotificationBell` and the /notificaciones page. Uses `Popover` from `@/components/ui/popover` instead of `DropdownMenu`.

- [ ] **Step 1: Create `src/components/opai/NotificationPopover.tsx`**

The component must include:

1. **Popover trigger**: Bell icon button with animated Badge showing unread count (same as current NotificationBell lines 164–178, but using `PopoverTrigger`)
2. **Header**: Title "Notificaciones" + unread count + "Marcar todas leídas" button + "Eliminar todas" button
3. **Filters row 1**: Toggle buttons "Todas" / "No leídas" (state: `filter: "all" | "unread"`)
4. **Filters row 2**: Module chips — dynamically built from loaded notifications using `getModuleMeta()` + `MODULE_SORT_ORDER`. State: `moduleFilter: string` defaulting to `"all"`. Compact chips, not full buttons.
5. **Notification list**: Scrollable `div` with `max-h-[min(50vh,400px)]` and `overflow-y-auto`. Each item shows: read/unread toggle circle, emoji icon, title (bold if unread + blue dot), message (1-line clamp), module badge with color, timestamp via `timeAgo()`. Click navigates + marks read. Hover shows delete trash icon.
6. **Reply inline for mentions**: "Responder en [context]" button that opens the reply Dialog (same modal logic from NotificationListClient lines 402–462 + 757–816).
7. **WhatsApp button**: Same as current NotificationBell for `followup_sent`/`email_opened` types.
8. **Infinite scroll**: Use IntersectionObserver on a sentinel div at the bottom, calling `loadMore()` from context.
9. **Empty state**: Bell icon + "No hay notificaciones" centered.
10. **Auto mark-seen**: Call `markAllSeen()` on first open (same pattern as NotificationListClient lines 311–317).

Key imports:
```ts
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Circle, Trash2, ExternalLink, MessageSquare, Reply, Loader2 } from "lucide-react";
import {
  type NotificationItem, TYPE_ICONS, TYPE_LABELS, getModuleMeta,
  getRecordName, getContextLabel, isSystemNotification, timeAgo,
  formatExactDate, MODULE_SORT_ORDER, MODULE_BADGE_STYLES,
} from "@/lib/notification-ui-utils";
```

PopoverContent must override default width constraints:
```tsx
<PopoverContent
  align="end"
  sideOffset={8}
  className="w-[min(24rem,calc(100vw-1rem))] min-w-0 max-w-none max-h-[70vh] p-0 overflow-hidden"
>
```

Port the `setOneReadState` logic from NotificationListClient (lines 335–369) which handles both marking as read AND as unread, plus CRM account activity seen + note context mark-read for mentions. This replaces the simpler `handleMarkOneRead` from NotificationBell. The context destructuring must include `markAsUnread`:

```ts
const {
  notifications, unreadCount, isLoading: loading, hasMore,
  markAsRead, markAsUnread, markAllRead: ctxMarkAllRead, markAllSeen,
  deleteNotification, deleteAll: ctxDeleteAll, refetch, loadMore,
} = useNotifications();
```

Port the reply modal logic from NotificationListClient:
- `getNotePayload()`, `canReplyInline()`, `openReplyModal()`, `submitInlineReply()` functions
- The Dialog with thread context display + textarea + send button
- Import `Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle` from `@/components/ui/dialog`

The filtered list logic (same as NotificationListClient lines 483–491):
```ts
const filteredNotifications = useMemo(() =>
  notifications.filter((n) => {
    if (filter === "unread" && n.read) return false;
    if (moduleFilter === "all") return true;
    return getModuleMeta(n).key === moduleFilter;
  }),
  [notifications, moduleFilter, filter]
);
```

Module options (same as NotificationListClient lines 464–481):
```ts
const moduleOptions = useMemo(() => {
  const unique = new Map<string, string>();
  for (const n of notifications) {
    const m = getModuleMeta(n);
    unique.set(m.key, m.label);
  }
  const sorted = Array.from(unique.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => {
      const idxA = MODULE_SORT_ORDER.indexOf(a.key);
      const idxB = MODULE_SORT_ORDER.indexOf(b.key);
      if (idxA === -1 && idxB === -1) return a.label.localeCompare(b.label, "es");
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  return [{ key: "all", label: "Todos" }, ...sorted];
}, [notifications]);
```

- [ ] **Step 2: Verify it compiles (import-only check)**

Add a temporary import in a test or check with `npx tsc --noEmit` if feasible. Or just verify in the next task when mounting it.

- [ ] **Step 3: Commit**

```bash
git add src/components/opai/NotificationPopover.tsx
git commit -m "feat: create NotificationPopover component with filters, reply, infinite scroll"
```

---

## Chunk 2: Wire into TopbarActions + Mobile + Remove old page

### Task 3: Add Chat button + NotificationPopover to TopbarActions (desktop)

**Files:**
- Modify: `src/components/opai/TopbarActions.tsx` (lines 131–139)

Insert Chat toggle button and NotificationPopover between ThemeToggle and Settings. New icon order: ThemeToggle → Chat → Notifications → Settings → Avatar.

- [ ] **Step 1: Add imports to TopbarActions**

Add at top of file:
```ts
import { MessageCircle } from "lucide-react";
import { NotificationPopover } from "./NotificationPopover";
```

The `useChatSidePanelContext` import already exists at line 25.

- [ ] **Step 2: Insert Chat button + NotificationPopover between ThemeToggle and Settings**

Replace lines 131–139 (the section from ThemeToggle to Settings link):

```tsx
{/* Right icons: Theme → Chat → Notifications → Settings */}
<ThemeToggle />
<button
  type="button"
  className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  onClick={chatCtx.togglePanel}
  aria-label="Abrir chat"
>
  <MessageCircle className="h-4 w-4" />
  {chatCtx.totalUnread > 0 && (
    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
  )}
</button>
<NotificationPopover />
<Link
  href="/opai/configuracion"
  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  aria-label="Configuración"
>
  <Settings className="h-4 w-4" />
</Link>
```

- [ ] **Step 3: Verify desktop topbar renders correctly**

Check the dev server at any page. The topbar should show: Search | + | Rol | — spacer — | 🌙 | 💬 | 🔔 | ⚙️ | Avatar

- [ ] **Step 4: Commit**

```bash
git add src/components/opai/TopbarActions.tsx
git commit -m "feat: add Chat + NotificationPopover to desktop topbar"
```

---

### Task 4: Add notification bell to mobile topbar

> **Note:** The spec's "Modified Files" section says "AppShell.tsx — no changes needed" but the spec's "Mobile Behavior" section requires adding the bell to the mobile topbar. The Mobile Behavior section takes precedence.

**Files:**
- Modify: `src/components/opai/AppShell.tsx` (lines 192–213)

Add a notification bell button in the mobile topbar, between the chat button and the hamburger menu.

- [ ] **Step 1: Import NotificationPopover in AppShell**

Add import near the top of AppShell.tsx:
```ts
import { NotificationPopover } from "./NotificationPopover";
```

- [ ] **Step 2: Insert NotificationPopover between chat button and hamburger**

After the chat button (line 202, after the closing `</button>`) and before the hamburger button (line 203), insert:

```tsx
<NotificationPopover compact />
```

The `NotificationPopover` component should accept an optional `compact` prop (like the current `NotificationBell`) that renders a slightly smaller trigger button (`h-8 w-8` vs `h-9 w-9`). Adjust the component to accept this prop.

- [ ] **Step 3: Remove the notification dot from hamburger menu button**

Since notifications now have their own dedicated bell in the mobile topbar, remove the notification badge from the hamburger button. Delete lines 210–212:
```tsx
{notificationUnreadCount > 0 && (
  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
)}
```

- [ ] **Step 4: Verify mobile topbar**

Check in mobile viewport. Should show: Logo | Rol | + | — spacer — | 🌙 | 🔍 | 💬 | 🔔 | ☰

- [ ] **Step 5: Commit**

```bash
git add src/components/opai/AppShell.tsx src/components/opai/NotificationPopover.tsx
git commit -m "feat: add NotificationPopover to mobile topbar"
```

---

### Task 5: Remove /notificaciones page and sidebar link

**Files:**
- Delete: `src/app/(app)/opai/notificaciones/page.tsx`
- Modify: `src/components/opai/AppLayoutClient.tsx` (lines 141–147)
- Delete (after confirming no other imports): `src/components/opai/NotificationListClient.tsx`
- Delete: `src/components/opai/NotificationBell.tsx`

- [ ] **Step 1: Remove sidebar nav item**

In `src/components/opai/AppLayoutClient.tsx`, remove lines 141–147:
```ts
{
  href: '/opai/notificaciones',
  label: 'Notificaciones',
  icon: Bell,
  show: true,
  badge: notificationUnreadCount,
},
```

Check if the `Bell` import is still used elsewhere in this file. If not, remove it from the import statement.

- [ ] **Step 2: Delete the notificaciones page**

Delete file: `src/app/(app)/opai/notificaciones/page.tsx`

- [ ] **Step 3: Check for other imports of NotificationListClient and NotificationBell**

Run grep to verify no other files import these:
```bash
grep -r "NotificationListClient" src/ --include="*.tsx" --include="*.ts"
grep -r "NotificationBell" src/ --include="*.tsx" --include="*.ts"
```

If `NotificationBell` is imported somewhere (e.g., in AppTopbar or other page-specific topbars), replace those imports with `NotificationPopover`.

- [ ] **Step 4: Delete old components and clean up barrel exports**

Delete: `src/components/opai/NotificationBell.tsx`
Delete: `src/components/opai/NotificationListClient.tsx` (only if no other file imports it)

Also remove the `NotificationBell` barrel export from `src/components/opai/index.ts` (line 58):
```ts
// Remove this line:
export { NotificationBell } from './NotificationBell';
```
Optionally add `NotificationPopover` as a barrel export in the same file.

- [ ] **Step 4b: Clean up orphaned `notificationUnreadCount` prop**

After removing the sidebar nav item (Step 1) and the hamburger badge (Task 4, Step 3), the `notificationUnreadCount` prop is no longer used by `AppShell`. Clean up:

1. Remove `notificationUnreadCount?: number` from the `AppShell` props interface in `src/components/opai/AppShell.tsx` (line 45)
2. Remove `const notificationUnreadCount = ...` default assignment in AppShell (line 66)
3. Remove `notificationUnreadCount={notificationUnreadCount}` from the `<AppShell>` call-site in `src/components/opai/AppLayoutClient.tsx` (line 274)
4. Check if `notificationUnreadCount` at `AppLayoutClient.tsx` line 81 (`const { unreadCount: notificationUnreadCount } = useNotifications()`) is still used for anything else in the file. If the sidebar nav item was the only consumer, remove this destructuring too.

- [ ] **Step 5: Remove "Ver todas" link from user dropdown menu**

In `src/components/opai/TopbarActions.tsx`, the user dropdown has a "Mis notificaciones" link (lines 184–189) pointing to `/opai/perfil/notificaciones`. This is the **notification preferences** page (bell/email settings), NOT the notification list. **Keep this link** — it goes to `/opai/perfil/notificaciones` which is the preferences config page, not the list page.

- [ ] **Step 6: Verify app compiles and runs**

Run: `npx next build --no-lint 2>&1 | tail -10`

Confirm:
- No broken imports
- Clicking bell in topbar opens popover with filters + notifications
- Clicking a notification navigates correctly
- Reply inline works for mentions
- Sidebar no longer shows "Notificaciones" item

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove /notificaciones page, replace with popover-only notification UI"
```
