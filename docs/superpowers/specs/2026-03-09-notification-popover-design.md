# Notification Popover — Design Spec

## Summary

Replace the current NotificationBell dropdown and the /notificaciones page with a single, full-featured notification popover anchored to a bell icon in the desktop topbar. The popover becomes the only place to view and manage notifications.

## Decisions

- **Topbar order (desktop)**: ThemeToggle — Chat — Notificaciones — Settings — Avatar
- **Panel type**: Dropdown/popover (~380px wide, max 70vh tall) anchored to the bell icon. No side panel, no content push.
- **No separate page**: Remove /opai/notificaciones page and its sidebar link. The popover is the sole notification UI.

## Popover Features

### Header
- Title "Notificaciones" + unread count (e.g. "9 sin leer")
- "Marcar todas leídas" button
- "Eliminar todas" button

### Filters
- Toggle: Todas / No leídas
- Module chips: Todos, Lead, Ops, Negocio, CRM, etc. (dynamically generated from loaded notifications)

### Notification List
- Scrollable list (max-height ~340px within 70vh popover)
- Infinite scroll (load more on scroll to bottom)
- Unread: highlighted background, blue dot indicator, bold title
- Read: reduced opacity, empty circle indicator
- Each item: emoji icon + title + message preview (1 line) + module badge + timestamp
- Click navigates to notification link and marks as read
- Toggle read/unread per item via circle/checkmark button
- Delete per item (trash icon on hover)

### Reply Inline
- For mention-type notifications: "Responder en [context]" button
- Opens the same reply modal as the current NotificationListClient (thread context + textarea)

### Close Behavior
- Click outside popover closes it
- Escape key closes it

## Architecture

### Reuse
- `useNotifications()` from NotificationContext — already handles polling, mark read/unread, delete, infinite scroll cursor
- Helper functions from NotificationListClient: `getModuleMeta()`, `getRecordName()`, `getContextLabel()`, `isSystemNotification()`, `timeAgo()`, `formatExactDate()`, TYPE_ICONS, MODULE_BADGE_STYLES, etc.
- Reply modal logic (thread fetch, inline reply submit)

### New Component
- `NotificationPopover` — replaces NotificationBell. Uses Popover (radix) instead of DropdownMenu. Contains all filter, list, action, and reply logic.

### Modified Files
- `TopbarActions.tsx` — add Chat toggle button + NotificationPopover + reorder icons
- `AppShell.tsx` — no changes needed (popover doesn't affect layout)
- Sidebar config — remove /notificaciones link

### Removed Files
- `/app/(app)/opai/notificaciones/page.tsx` — the standalone page
- `NotificationListClient.tsx` — move reusable logic to shared utils, delete the page-level component
- `NotificationBell.tsx` — replaced by NotificationPopover

### Shared Utils Extraction
Extract from NotificationListClient into a shared file (e.g. `lib/notification-ui-utils.ts`):
- TYPE_ICONS, TYPE_LABELS, MODULE_LABELS, MODULE_BADGE_STYLES, MODULE_SORT_ORDER
- TYPE_MODULE_FALLBACK, NON_SYSTEM_TYPES
- getModuleMeta(), getRecordName(), getContextLabel(), isSystemNotification()
- timeAgo(), formatExactDate()

## Mobile Behavior

The mobile topbar already has a chat button. Notification bell should also appear in the mobile topbar. On mobile, the popover should render as a near-full-screen overlay (same pattern as other mobile popovers in the app).
