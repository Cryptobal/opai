# Chat Visual Refactoring — Slack Style

**Date**: 2026-03-07
**Status**: Approved
**Scope**: Visual/UX only — no logic, hooks, types, or API changes

## Context

OPAI's chat module currently renders messages as WhatsApp-style bubbles (right/left aligned, bordered cards). This refactoring transforms the visual layer to match Slack's design: full-width messages, message grouping, improved reactions, and consistent mobile behavior across all portals.

## Critical Finding: Self-Contained Portal Chats

Each portal has its own independent chat implementation with inline MessageBubble components. They do NOT use the shared chat components from `src/components/chat/`.

| Portal | File | Lines |
|--------|------|-------|
| Guard | `src/components/portal/ChatGuardSection.tsx` | 463 |
| Supervisor | `src/components/portal/supervisor/SupervisorChat.tsx` | 238 |
| Client | `src/components/portales/ChatClienteSection.tsx` | 642 |
| Rondas | `src/components/portal/rondas/ChatRondasSection.tsx` | 362 |
| Main OPAI | `src/components/chat/ChatMessage.tsx` + shared components | ~5400 total |

## Strategy: Shared Presentational Components

Create shared visual-only components. Each portal swaps its inline MessageBubble for the shared component while keeping all data-fetching/Pusher logic untouched.

## Design Tokens

```
bg-principal:     #0a0e17
bg-sidebar:       #0d1220
bg-hover:         rgba(255,255,255,0.04)
bg-active:        rgba(45,212,191,0.08)
bg-input:         #141a2a
border-default:   rgba(255,255,255,0.06)
border-active:    rgba(45,212,191,0.3)
text-primary:     rgba(255,255,255,0.88)
text-muted:       rgba(255,255,255,0.45)
text-dim:         rgba(255,255,255,0.28)
accent:           #2dd4bf
accent-dim:       rgba(45,212,191,0.15)
green-online:     #22c55e
reaction-bg:      rgba(255,255,255,0.06)
reaction-active:  rgba(45,212,191,0.12)
```

Breakpoint: `lg` (1024px). Below = mobile behavior.

## Message Layout (Slack-style)

### Full-width, no bubbles
- Avatar (36px, border-radius 8px) left-aligned
- Username (14px, bold) + timestamp (11px, dim) on same line
- Message text below (14px, line-height 1.55)
- Hover: full row background `rgba(255,255,255,0.04)`

### Message Grouping
Messages from same user within 5 minutes are grouped:
- First message: shows avatar + name + timestamp
- Subsequent: text only with 48px left padding (36px avatar + 12px gap)
- Grouped messages show timestamp only on hover

## Mobile Behavior (All Portals)

### Container
- Chat fills space between portal header and bottom nav bar
- Uses `flex: 1` with `overflow: hidden` on container
- `overflow-y: auto` only on messages area
- Input stays at bottom of flex container (NOT position: fixed)
- NEVER covers bottom nav bar
- NEVER uses `min-h-dvh` or hardcoded `calc()` heights

### Navigation
- Channel list: full-screen flat list, 56px rows, ordered by activity
- Conversation: slide-in-right animation (translateX 100% -> 0, 250ms)
- Back: left arrow button or native swipe gesture
- Close chat: swipe-down gesture or X button in header

### Floating Panel (ChatFloatingPanel)
- Mobile: full-screen view (not draggable bottom sheet)
- Close: swipe-down or X button
- Must respect bottom nav bar

## Reactions

### Desktop (hover)
- Emoji trigger icon (28px) appears on hover, right side of message
- Click opens horizontal bar: 4 quick emojis (thumbsup, check, eyes, tada) + thread + more
- Bar: absolute positioned above message, scale animation 150ms

### Mobile (long-press)
- 500ms long-press triggers floating menu
- Top row: 5 large emojis (22px)
- Bottom row: Reply | Thread | Copy
- Full-screen transparent overlay to dismiss

### Reaction Pills
- border-radius 12px, format: [emoji] [count]
- Active (user reacted): teal border + teal background
- Hover tooltip: list of who reacted

## Sidebar (Desktop)

- Width: 260px
- Categories: uppercase 11px, font-weight 700, letter-spacing 0.05em
- Channels: `#` prefix icon
- Active channel: teal background `rgba(45,212,191,0.08)`, `#` in teal
- Unread: bold text + teal numeric badge
- Hover: `rgba(255,255,255,0.04)`

## Input

- Container: border-radius 12px, bg `#141a2a`, border subtle
- Focus: border changes to teal `rgba(45,212,191,0.3)`
- Layout: [paperclip] [expandable textarea] [emoji] [send (teal bg)]
- Mobile: `padding-bottom: env(safe-area-inset-bottom)`

## Date Separators

- Horizontal line with centered pill
- Pill: border, border-radius 20px, font-weight 600, 12px
- Text: "Hoy", "Ayer", "Martes, 3 de marzo"

## Files to Modify/Create

### New shared presentational components
1. `src/components/chat/ChatSlackMessage.tsx` — Slack-style message renderer
2. `src/components/chat/ChatDateDivider.tsx` — Date separator pill
3. `src/components/chat/ChatReactionPill.tsx` — Reaction pill with active state
4. `src/components/chat/ChatReactionBar.tsx` — Hover bar (desktop) + long-press menu (mobile)

### Core chat components (visual changes only)
5. `ChatMessage.tsx` — Replace bubble with Slack layout
6. `ChatMessageList.tsx` — Add isFirstInGroup calculation, use ChatDateDivider
7. `ChatInput.tsx` — Rounded container, teal focus, safe-area
8. `ChatChannelList.tsx` — Slack categories, # icons, teal active
9. `ChatChannelListItem.tsx` — # prefix, teal active, mobile 56px rows
10. `ChatPresenceBar.tsx` — # prefix, green online badge
11. `ChatPage.tsx` — Sidebar 260px, design tokens
12. `ChatFloatingPanel.tsx` — Mobile full-screen, swipe-down close, X button
13. `ChatAttachmentPreview.tsx` — Horizontal thumbnails
14. `ChatThreadPanel.tsx` — Match Slack style
15. `ChatMessageSystem.tsx` — Align with full-width layout

### Portal chat sections (swap bubbles, fix containers)
16. `ChatGuardSection.tsx` — Replace MessageBubble, fix container height
17. `SupervisorChat.tsx` — Replace inline bubble, fix container
18. `ChatClienteSection.tsx` — Replace ClienteMessageBubble, fix container
19. `ChatRondasSection.tsx` — Replace RondasMessageBubble, fix container

## Implementation Phases

### Phase 1: Messages
- Create ChatSlackMessage.tsx + ChatDateDivider.tsx
- Update ChatMessage.tsx to use Slack layout
- Update ChatMessageList.tsx with grouping logic (isFirstInGroup)

### Phase 2: Sidebar & Navigation
- Update ChatChannelList.tsx + ChatChannelListItem.tsx
- Update ChatPresenceBar.tsx

### Phase 3: Portal Unification
- Update all 4 portal chat sections to use ChatSlackMessage
- Fix container heights (flex-based, not hardcoded calc)
- Ensure bottom nav bar is never covered

### Phase 4: Mobile Full-Screen
- Update ChatFloatingPanel.tsx (full-screen, not bottom sheet)
- Implement swipe-down close + X button
- Slide-in-right for conversation navigation

### Phase 5: Reactions
- Create ChatReactionBar.tsx + ChatReactionPill.tsx
- Desktop hover trigger + floating bar
- Mobile long-press + floating menu

### Phase 6: Polish
- ChatInput.tsx visual refinement
- ChatAttachmentPreview.tsx horizontal thumbnails
- ChatThreadPanel.tsx + ChatMessageSystem.tsx alignment
- Final consistency check across all portals

## What Does NOT Change

- All hooks (useChatMessages, useChatChannel, useChatTyping, useChatUnreadCounts, usePusher)
- All type definitions (chat-types.ts)
- All API endpoints and Pusher event handling
- All modals (ChatNewDmModal, NewExternalChatModal)
- Library files (chat.ts, chat-pusher.ts)
- Portal data-fetching and Pusher subscription logic
- Authentication logic
- StartChatButton, AiHelpChatWidget
