# Chat Slack-Style Visual Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the chat UI from WhatsApp-style bubbles to Slack-style full-width messages across all portals and the main OPAI chat.

**Architecture:** Create shared presentational components (`ChatSlackMessage`, `ChatDateDivider`, `ChatReactionPill`, `ChatReactionBar`) that handle ONLY rendering. Each portal swaps its inline MessageBubble for the shared component while keeping all data-fetching/Pusher/API logic untouched. No hooks, types, or API endpoints are modified.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui, Pusher (real-time), Vitest (node env, no jsdom)

**Verification:** Since this is visual-only (no new logic), verification = TypeScript compilation (`npx tsc --noEmit`) + dev server check. No unit tests for CSS/JSX changes.

**Design doc:** `docs/plans/2026-03-07-chat-slack-refactoring-design.md`

---

## Task 1: Create ChatDateDivider Component

**Files:**
- Create: `src/components/chat/ChatDateDivider.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface ChatDateDividerProps {
  label: string;
  className?: string;
}

/**
 * Pill-style date separator with horizontal lines.
 * Label examples: "Hoy", "Ayer", "Martes, 3 de marzo"
 */
export function ChatDateDivider({ label, className }: ChatDateDividerProps) {
  return (
    <div className={cn("flex items-center gap-3 my-4", className)}>
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
      <span className="shrink-0 text-xs font-semibold text-[rgba(255,255,255,0.45)] border border-[rgba(255,255,255,0.06)] rounded-[20px] px-3 py-1">
        {label}
      </span>
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to ChatDateDivider

**Step 3: Commit**

```bash
git add src/components/chat/ChatDateDivider.tsx
git commit -m "feat(chat): add ChatDateDivider pill-style date separator"
```

---

## Task 2: Create ChatSlackMessage Component

This is the core shared presentational component that ALL chat views will use.

**Files:**
- Create: `src/components/chat/ChatSlackMessage.tsx`

**Step 1: Create the component**

The component accepts these props:
- `message: ChatMessageData` — the message data
- `isFirstInGroup: boolean` — whether to show avatar/name or just indented text
- `senderColorClass?: string` — optional override for sender name color
- `onReply?: () => void` — reply callback
- `onOpenThread?: (messageId: string) => void` — thread callback
- `children?: ReactNode` — slot for reaction pills, attachments, etc.

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";

interface ChatSlackMessageProps {
  message: ChatMessageData;
  isFirstInGroup: boolean;
  senderColorClass?: string;
  renderContent?: (content: string) => ReactNode;
  children?: ReactNode;
}

function defaultSenderColor(type: ChatSenderType): string {
  switch (type) {
    case "ADMIN": return "text-blue-400";
    case "GUARD": return "text-emerald-400";
    case "CLIENT": return "text-amber-400";
    default: return "text-zinc-400";
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Slack-style message component — full-width, no bubbles.
 * Used by main OPAI chat AND all portal chat sections.
 */
export function ChatSlackMessage({
  message,
  isFirstInGroup,
  senderColorClass,
  renderContent,
  children,
}: ChatSlackMessageProps) {
  const colorClass = senderColorClass || defaultSenderColor(message.senderType);
  const time = formatTime(message.createdAt);

  if (!isFirstInGroup) {
    // Grouped message: just text with indent, timestamp on hover
    return (
      <div className="group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 py-0.5 transition-colors duration-100">
        {/* Hover timestamp in the avatar column */}
        <span className="w-9 shrink-0 mr-3 text-[11px] text-[rgba(255,255,255,0.28)] opacity-0 group-hover:opacity-100 transition-opacity text-right pt-0.5 select-none">
          {time}
        </span>
        <div className="min-w-0 flex-1">
          {/* Reply quote */}
          {message.replyTo && (
            <div className="border-l-2 border-zinc-600 pl-2 mb-1 py-0.5">
              <p className="text-xs font-medium text-zinc-400">{message.replyTo.senderName}</p>
              <p className="text-xs text-zinc-500 line-clamp-1">{message.replyTo.content}</p>
            </div>
          )}
          <div className="text-sm text-[rgba(255,255,255,0.88)] leading-[1.55] break-words whitespace-pre-wrap">
            {renderContent ? renderContent(message.content) : message.content}
          </div>
          {message.isEdited && (
            <span className="text-[10px] text-zinc-500 italic ml-1">(editado)</span>
          )}
          {children}
        </div>
      </div>
    );
  }

  // First message in group: full layout with avatar + name + timestamp
  return (
    <div className="group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 pt-2 pb-0.5 transition-colors duration-100">
      {/* Avatar */}
      <div className="w-9 h-9 shrink-0 mr-3 rounded-lg bg-zinc-700 flex items-center justify-center overflow-hidden">
        {message.senderAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-zinc-300">{getInitials(message.senderName)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Name + timestamp line */}
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-bold", colorClass)}>
            {message.senderName}
          </span>
          <span className="text-[11px] text-[rgba(255,255,255,0.28)]">
            {time}
          </span>
        </div>

        {/* Reply quote */}
        {message.replyTo && (
          <div className="border-l-2 border-zinc-600 pl-2 mb-1 mt-0.5 py-0.5">
            <p className="text-xs font-medium text-zinc-400">{message.replyTo.senderName}</p>
            <p className="text-xs text-zinc-500 line-clamp-1">{message.replyTo.content}</p>
          </div>
        )}

        {/* Content */}
        <div className="text-sm text-[rgba(255,255,255,0.88)] leading-[1.55] break-words whitespace-pre-wrap">
          {renderContent ? renderContent(message.content) : message.content}
        </div>
        {message.isEdited && (
          <span className="text-[10px] text-zinc-500 italic ml-1">(editado)</span>
        )}

        {/* Slot for attachments, reactions, thread indicator, etc. */}
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to ChatSlackMessage

**Step 3: Commit**

```bash
git add src/components/chat/ChatSlackMessage.tsx
git commit -m "feat(chat): add ChatSlackMessage shared Slack-style message component"
```

---

## Task 3: Update ChatMessageList with Grouping Logic + ChatDateDivider

**Files:**
- Modify: `src/components/chat/ChatMessageList.tsx`

**Step 1: Add isFirstInGroup calculation and replace date separator**

Changes needed:
1. Import `ChatDateDivider`
2. Add `isFirstInGroup` prop to `ChatMessage` calls
3. Calculate grouping: same `senderId` + within 5 minutes = grouped
4. Replace inline date separator with `ChatDateDivider`

In the message rendering loop, before each `ChatMessage`, compute:
```tsx
// Inside the group.messages.map, add index parameter
group.messages.map((msg, msgIdx) => {
  // Compute isFirstInGroup
  const prevMsg = msgIdx > 0 ? group.messages[msgIdx - 1] : null;
  const isFirstInGroup =
    !prevMsg ||
    prevMsg.senderId !== msg.senderId ||
    prevMsg.systemEventType != null ||
    (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) > 5 * 60 * 1000;

  // Pass to ChatMessage
  return msg.systemEventType ? (
    <ChatMessageSystem key={msg.id} message={msg} />
  ) : (
    <ChatMessage
      key={msg.id}
      message={msg}
      isOwn={isOwnMessage(msg)}
      isFirstInGroup={isFirstInGroup}
      onReply={() => onReply(msg)}
      // ... rest of props unchanged
    />
  );
})
```

Replace the date separator JSX:
```tsx
// OLD:
<div className="flex items-center gap-3 my-4">
  <div className="flex-1 h-px bg-zinc-800" />
  <span className="shrink-0 text-xs text-zinc-500 font-medium">{group.dateLabel}</span>
  <div className="flex-1 h-px bg-zinc-800" />
</div>

// NEW:
<ChatDateDivider label={group.dateLabel} />
```

Also update the `formatDateSeparator` function to use longer day names for dates within the current year:
```tsx
// For dates within current year (not today/yesterday), format as "Lunes, 3 de marzo"
const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dayName = dayNames[date.getDay()];
const monthName = monthNames[date.getMonth()];
return `${dayName}, ${day} de ${monthName}`;
```

**Step 2: Update ChatMessage props interface to accept isFirstInGroup**

In `ChatMessage.tsx`, add to the interface:
```tsx
isFirstInGroup?: boolean;
```

This is needed so the file compiles. The actual ChatMessage visual rewrite happens in Task 4.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/chat/ChatMessageList.tsx src/components/chat/ChatMessage.tsx src/components/chat/ChatDateDivider.tsx
git commit -m "feat(chat): add message grouping logic and pill-style date separators"
```

---

## Task 4: Rewrite ChatMessage.tsx to Slack Layout

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`

This is the largest task. Key changes:
1. Remove bubble styling (bg-blue-600/20, rounded-xl, max-w-[75%], justify-end/start alignment)
2. Use full-width Slack layout from ChatSlackMessage as the base pattern
3. Keep ALL existing logic: reactions, action bar, mobile long-press, editing, thread indicator, content rendering
4. Accept `isFirstInGroup` prop

**Step 1: Rewrite the JSX structure**

The core wrapper changes from:
```tsx
// OLD
<div className={cn("group flex mb-1.5", isOwn ? "justify-end" : "justify-start")}>
  <div className={cn("max-w-[75%] lg:max-w-[60%] relative")}>
```

To Slack-style full-width:
```tsx
// NEW
<div
  className="group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 transition-colors duration-100"
  // ... keep touch handlers for long-press
>
```

The message structure becomes:
- If `isFirstInGroup`: avatar (36px, rounded-lg) + name/timestamp + content
- If not: 48px left indent + content, timestamp on hover

Remove all `isOwn`-based left/right alignment. All messages render left-aligned full-width.

Keep the `renderContent()` function, the editing mode, the action bar (emoji trigger + expanded bar), the mobile bottom sheet, the reaction display, the thread indicator — but reposition them for the Slack layout.

For the action bar, position it at `right-4 -top-3` (always right side, not conditionally based on isOwn).

For reactions, render them below the message content (no longer justified start/end):
```tsx
<div className="flex flex-wrap gap-1 mt-1">
  {message.reactions.map((reaction) => (
    <button
      key={reaction.emoji}
      onClick={() => handleReaction(reaction.emoji)}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border px-2 py-0.5 text-xs transition-colors",
        reaction.senders.some(s => s.id === currentUserId)
          ? "bg-[rgba(45,212,191,0.12)] border-[rgba(45,212,191,0.3)] hover:bg-[rgba(45,212,191,0.2)]"
          : "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]"
      )}
      title={reaction.senders.map((s) => s.name).join(", ")}
    >
      <span>{reaction.emoji}</span>
      <span className="text-[rgba(255,255,255,0.45)]">{reaction.count}</span>
    </button>
  ))}
</div>
```

For the mobile action sheet, reorder to show emojis FIRST (top), then actions below:
```tsx
{/* Mobile: emojis first */}
{channelId && (
  <div className="px-4 mb-3">
    <div className="flex items-center justify-around">
      {["👍", "✅", "👀", "🎉", "❤️"].map((emoji) => (
        <button key={emoji} onClick={() => { handleReaction(emoji); setShowMobileActions(false); }}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[22px] hover:bg-zinc-800"
        >{emoji}</button>
      ))}
    </div>
  </div>
)}
{/* Then actions */}
<div className="space-y-1">
  <button ...>Responder</button>
  <button ...>Abrir hilo</button>
  <button ...>Copiar texto</button>
  {/* edit/delete as before */}
</div>
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Run dev server and visually verify**

Run: `npm run dev`
Navigate to `/chat`, select a channel, verify:
- Messages are full-width (no bubbles)
- Own and others' messages look the same (left-aligned)
- Avatar shows for first message in group
- Subsequent messages within 5 min from same user are indented
- Hover shows subtle background
- Action bar appears on hover
- Mobile long-press shows emoji menu

**Step 4: Commit**

```bash
git add src/components/chat/ChatMessage.tsx
git commit -m "feat(chat): rewrite ChatMessage to Slack-style full-width layout"
```

---

## Task 5: Update ChatPresenceBar (Header)

**Files:**
- Modify: `src/components/chat/ChatPresenceBar.tsx`

**Step 1: Add # prefix and green online badge**

Changes:
1. Channel name gets `# ` prefix
2. Online indicator uses green dot + "X en línea" text, positioned next to the name
3. Background uses `bg-[#0d1220]` instead of `bg-zinc-900/50`
4. Slightly darker border

```tsx
// Channel name with # prefix
<h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)] truncate">
  <span className="text-[#2dd4bf]">#</span> {channelName}
</h3>

// Online badge inline with name
{onlineCount > 0 && (
  <div className="flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
    <span className="text-xs text-[rgba(255,255,255,0.45)]">{onlineCount} en línea</span>
  </div>
)}
```

Move online indicator from right side to below the channel name (mobile) or inline (desktop).

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/chat/ChatPresenceBar.tsx
git commit -m "feat(chat): update ChatPresenceBar with # prefix and green online badge"
```

---

## Task 6: Update ChatChannelList + ChatChannelListItem (Sidebar Slack-style)

**Files:**
- Modify: `src/components/chat/ChatChannelList.tsx`
- Modify: `src/components/chat/ChatChannelListItem.tsx`

**Step 1: Update ChatChannelListItem**

Changes:
1. Add `#` icon prefix for channels
2. Active channel: `bg-[rgba(45,212,191,0.08)]` background, `#` in teal `text-[#2dd4bf]`
3. Unread channels: name text in bold + teal badge
4. Hover: `bg-[rgba(255,255,255,0.04)]`
5. Font size: 13px for channel name

**Step 2: Update ChatChannelList section headers**

Changes:
1. Section headers: `text-[11px] uppercase font-bold tracking-[0.05em] text-[rgba(255,255,255,0.28)]`
2. Remove heavy borders between sections

**Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/chat/ChatChannelList.tsx src/components/chat/ChatChannelListItem.tsx
git commit -m "feat(chat): update sidebar to Slack-style with # icons and teal active state"
```

---

## Task 7: Update ChatPage Layout

**Files:**
- Modify: `src/components/chat/ChatPage.tsx`

**Step 1: Apply design tokens**

Changes:
1. Sidebar width: `lg:w-[260px] lg:min-w-[260px]` (was `lg:w-80 lg:min-w-[320px]`)
2. Background: `bg-[#0a0e17]` (main area), sidebar border uses `border-[rgba(255,255,255,0.06)]`
3. Remove `rounded-lg border border-zinc-800 bg-zinc-950` from outer container (the page fills the layout)

**Step 2: Verify compilation and visual**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/chat/ChatPage.tsx
git commit -m "feat(chat): update ChatPage layout with 260px sidebar and design tokens"
```

---

## Task 8: Update Portal Chat — ChatGuardSection

**Files:**
- Modify: `src/components/portal/ChatGuardSection.tsx`

**Step 1: Import ChatSlackMessage and ChatDateDivider**

Add at top:
```tsx
import { ChatSlackMessage } from "@/components/chat/ChatSlackMessage";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
```

**Step 2: Add grouping helper function**

Add before the component:
```tsx
function computeIsFirstInGroup(messages: ChatMessageData[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.senderType === "SYSTEM" || prev.senderId !== curr.senderId) return true;
  return (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 5 * 60 * 1000;
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}`;
}
```

**Step 3: Replace MessageBubble with ChatSlackMessage in the messages map**

Replace:
```tsx
{messages.map((msg) => (
  <MessageBubble key={msg.id} message={msg} isOwn={...} onReply={...} />
))}
```

With:
```tsx
{messages.map((msg, idx) => {
  // Date separator
  const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
  const currDateKey = getDateKey(msg.createdAt);
  const showDateDivider = currDateKey !== prevDateKey;
  const isFirst = computeIsFirstInGroup(messages, idx);

  if (msg.senderType === "SYSTEM") {
    return (
      <React.Fragment key={msg.id}>
        {showDateDivider && <ChatDateDivider label={formatDateLabel(msg.createdAt)} />}
        <div className="flex justify-center py-1">
          <span className="text-[10px] text-zinc-500 italic">{msg.content}</span>
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment key={msg.id}>
      {showDateDivider && <ChatDateDivider label={formatDateLabel(msg.createdAt)} />}
      <ChatSlackMessage message={msg} isFirstInGroup={isFirst}>
        {/* Attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-1 space-y-1">
            {msg.attachments.map((att, i) => (
              <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[#2dd4bf] hover:text-teal-300">
                {att.fileType?.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileIcon className="h-3 w-3" />}
                {att.fileName}
              </a>
            ))}
          </div>
        )}
      </ChatSlackMessage>
    </React.Fragment>
  );
})}
```

**Step 4: Fix container height**

Replace:
```tsx
<div className="flex flex-col h-[calc(100dvh-120px)]">
```
With:
```tsx
<div className="flex flex-col flex-1 overflow-hidden">
```

The parent `<main>` in `GuardPortalClient.tsx` already has `flex-1 overflow-y-auto pb-20`. The chat section should use `flex-1` and handle its own internal scroll.

Update the messages scroll container:
```tsx
<div ref={messagesContainerRef} onScroll={handleScroll}
  className="flex-1 overflow-y-auto py-3">
```

Remove `px-4` from messages container (ChatSlackMessage handles its own padding).

**Step 5: Delete the inline MessageBubble function**

Remove the entire `function MessageBubble(...)` at the bottom of the file.

**Step 6: Update input styling to match design tokens**

Replace input area styling:
```tsx
<div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
  <div className="flex items-end gap-2 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] px-3 transition-colors">
```

Send button:
```tsx
className="h-[38px] w-[38px] rounded-lg bg-[#2dd4bf] flex items-center justify-center text-zinc-900 disabled:opacity-40 hover:bg-teal-400 transition-colors"
```

**Step 7: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 8: Commit**

```bash
git add src/components/portal/ChatGuardSection.tsx
git commit -m "feat(chat): update ChatGuardSection to Slack-style messages"
```

---

## Task 9: Update Portal Chat — SupervisorChat

**Files:**
- Modify: `src/components/portal/supervisor/SupervisorChat.tsx`

**Step 1: Import shared components**

```tsx
import { ChatSlackMessage } from "@/components/chat/ChatSlackMessage";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
```

**Step 2: Add the same grouping helpers**

Add `computeIsFirstInGroup`, `getDateKey`, `formatDateLabel` (same as Task 8).

**Step 3: Replace inline message rendering in conversation view**

Replace the inline bubble render:
```tsx
// OLD:
messages.map((msg, i) => {
  const isMe = msg.senderId === session.adminId && msg.senderType === "ADMIN";
  return (
    <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${isMe ? "bg-blue-600 ..." : "bg-zinc-800 ..."}`}>
```

With ChatSlackMessage:
```tsx
messages.map((msg, idx) => {
  const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
  const currDateKey = getDateKey(msg.createdAt);
  const showDateDivider = currDateKey !== prevDateKey;
  const isFirst = computeIsFirstInGroup(messages, idx);

  return (
    <React.Fragment key={msg.id || idx}>
      {showDateDivider && <ChatDateDivider label={formatDateLabel(msg.createdAt)} />}
      <ChatSlackMessage message={msg} isFirstInGroup={isFirst} />
    </React.Fragment>
  );
})
```

**Step 4: Fix container height**

Replace `h-[calc(100dvh-80px)]` with `flex-1 overflow-hidden`.

**Step 5: Update channel list styling**

The channel list buttons should get Slack-style:
- 56px height rows
- `#` prefix icon
- Teal unread badge

**Step 6: Update input styling**

Apply same rounded container with teal focus as Task 8.

**Step 7: Verify compilation + commit**

```bash
git add src/components/portal/supervisor/SupervisorChat.tsx
git commit -m "feat(chat): update SupervisorChat to Slack-style messages"
```

---

## Task 10: Update Portal Chat — ChatClienteSection

**Files:**
- Modify: `src/components/portales/ChatClienteSection.tsx`

Same pattern as Tasks 8-9:

**Step 1:** Import `ChatSlackMessage`, `ChatDateDivider`
**Step 2:** Add grouping helpers
**Step 3:** Replace `ClienteMessageBubble` with `ChatSlackMessage` in the `ClienteChatConversation` component
**Step 4:** Fix container height (`h-[calc(100dvh-120px)]` → `flex-1 overflow-hidden`)
**Step 5:** Update input styling (teal focus, rounded container)
**Step 6:** Delete inline `ClienteMessageBubble` function
**Step 7:** Verify + commit

```bash
git add src/components/portales/ChatClienteSection.tsx
git commit -m "feat(chat): update ChatClienteSection to Slack-style messages"
```

---

## Task 11: Update Portal Chat — ChatRondasSection

**Files:**
- Modify: `src/components/portal/rondas/ChatRondasSection.tsx`

Same pattern:

**Step 1:** Import `ChatSlackMessage`, `ChatDateDivider`
**Step 2:** Add grouping helpers
**Step 3:** Replace `RondasMessageBubble` with `ChatSlackMessage`
**Step 4:** Fix container: replace `min-h-dvh` with flex-based layout
**Step 5:** Update input styling
**Step 6:** Delete inline `RondasMessageBubble` function
**Step 7:** Fix the input padding — currently uses `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` which is huge. Change to `pb-[env(safe-area-inset-bottom)]` since the bottom nav handles its own space.
**Step 8:** Verify + commit

```bash
git add src/components/portal/rondas/ChatRondasSection.tsx
git commit -m "feat(chat): update ChatRondasSection to Slack-style messages"
```

---

## Task 12: Update ChatFloatingPanel — Mobile Full-Screen

**Files:**
- Modify: `src/components/chat/ChatFloatingPanel.tsx`

This is a major change. Key requirements:
1. Mobile: full-screen view that respects bottom nav bar (NOT draggable bottom sheet)
2. Close via swipe-down gesture OR X button in header
3. Slide-in-right animation for conversation navigation
4. Desktop: keep fixed panel but update visual styling

**Step 1: Read the current file thoroughly**

Read `ChatFloatingPanel.tsx` to understand the current draggable behavior and mobile layout.

**Step 2: Remove drag-to-close behavior on mobile**

Replace the draggable container with a fixed full-screen view:
```tsx
// Mobile: full-screen between header and bottom nav
<div className="fixed inset-0 z-50 lg:hidden" style={{ bottom: 'var(--bottom-nav-height, 0px)' }}>
  {/* X close button in header */}
  <div className="flex items-center justify-between h-14 px-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
    <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)]">Chat</h3>
    <button onClick={closePanel} className="p-2 text-zinc-400 hover:text-zinc-200">
      <X className="h-5 w-5" />
    </button>
  </div>
  {/* Content */}
  <div className="flex flex-col h-full bg-[#0a0e17]">
    {/* Channel list or conversation */}
  </div>
</div>
```

**Step 3: Add slide-in-right animation for conversation**

When a channel is selected on mobile, the conversation slides in from the right:
```tsx
<div className={cn(
  "absolute inset-0 bg-[#0a0e17] transition-transform duration-250 ease-out",
  selectedChannel ? "translate-x-0" : "translate-x-full"
)}>
```

**Step 4: Update desktop panel styling**

Apply design tokens to the desktop fixed panel.

**Step 5: Verify + commit**

```bash
git add src/components/chat/ChatFloatingPanel.tsx
git commit -m "feat(chat): replace mobile bottom sheet with full-screen chat view"
```

---

## Task 13: Update ChatInput Visual Polish

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

**Step 1: Wrap in rounded container**

The outer container gets:
```tsx
<div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220] pb-[env(safe-area-inset-bottom)]">
  <div className="flex items-end gap-2 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] transition-colors px-3 py-1">
    {/* paperclip button */}
    {/* textarea - remove its own border/bg, make transparent */}
    {/* emoji button */}
    {/* send button with teal bg */}
  </div>
</div>
```

**Step 2: Update textarea to be transparent within container**

```tsx
className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.28)] focus:outline-none max-h-28"
```

**Step 3: Update send button to teal**

```tsx
className="h-8 w-8 rounded-lg bg-[#2dd4bf] flex items-center justify-center text-zinc-900 disabled:opacity-40 hover:bg-teal-400 transition-colors shrink-0 my-0.5"
```

**Step 4: Verify + commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat(chat): update ChatInput with rounded container and teal focus"
```

---

## Task 14: Update ChatAttachmentPreview

**Files:**
- Modify: `src/components/chat/ChatAttachmentPreview.tsx`

**Step 1: Change to horizontal thumbnail row**

```tsx
<div className="flex items-center gap-2 mt-2">
  {attachments.map((att, i) => (
    att.fileType?.startsWith("image/") ? (
      <div key={i} className="w-[120px] h-[100px] lg:w-[120px] lg:h-[100px] w-[80px] h-[80px] rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] overflow-hidden cursor-pointer transition-colors shrink-0">
        <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
      </div>
    ) : (
      // File card unchanged
    )
  ))}
</div>
```

**Step 2: Verify + commit**

```bash
git add src/components/chat/ChatAttachmentPreview.tsx
git commit -m "feat(chat): update attachments to horizontal thumbnail row"
```

---

## Task 15: Update ChatThreadPanel + ChatMessageSystem

**Files:**
- Modify: `src/components/chat/ChatThreadPanel.tsx`
- Modify: `src/components/chat/ChatMessageSystem.tsx`

**Step 1: ChatMessageSystem — center with subtle styling**

Keep centered layout, update colors to design tokens.

**Step 2: ChatThreadPanel — messages use Slack style**

The thread panel already uses `ChatMessage` for replies, so it inherits the Slack style from Task 4 automatically. Just update the panel background and borders.

**Step 3: Verify + commit**

```bash
git add src/components/chat/ChatThreadPanel.tsx src/components/chat/ChatMessageSystem.tsx
git commit -m "feat(chat): align thread panel and system messages with Slack style"
```

---

## Task 16: Final Verification — Full Consistency Check

**Step 1: TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: Zero errors

**Step 2: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Visual verification checklist**

Open dev server (`npm run dev`) and verify:

- [ ] `/chat` page: messages are full-width Slack-style, sidebar has # icons and teal active state
- [ ] `/chat` page: date separators are pill-style
- [ ] `/chat` page: message grouping works (same user within 5 min grouped)
- [ ] `/chat` page: hover shows subtle background + action bar
- [ ] `/chat` page: reactions have teal active state
- [ ] `/chat` mobile: channel list → conversation slides, no bubbles
- [ ] Floating panel (any non-chat page): mobile shows full-screen, not bottom sheet
- [ ] Floating panel: X button closes, channel navigation works
- [ ] Guard portal (`/portal/guardia`): chat uses Slack messages, input has teal focus
- [ ] Supervisor portal (`/portal/supervisor`): chat uses Slack messages
- [ ] Client portal (`/portal/cliente`): chat uses Slack messages
- [ ] Rondas portal (`/portal/rondas`): chat uses Slack messages
- [ ] All portals: chat never covers bottom nav bar
- [ ] All portals: input is accessible (not behind keyboard on mobile)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(chat): complete Slack-style visual refactoring across all portals"
```
