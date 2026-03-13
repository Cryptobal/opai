# Chat External Channels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add external chat channels (EXTERNAL type) for CrmContact conversations, per-user archiving, and permanent deletion with role-based permissions — plus new Prospectos/Clientes/Archivados sections in the chat panel.

**Architecture:** New `EXTERNAL` enum value on `ChatChannelType` + `ChatChannelParticipant` model (supports ADMIN and CONTACT types, separate from `ChatDmParticipant` which handles internal DMs) + `ChatChannelArchive` model for per-user archiving. The Prospectos/Clientes section distinction is derived dynamically from `CrmAccount.status` at query time — not stored in the channel — so prospect→client conversion auto-migrates channels between sections.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL, `chat` schema), `requireAuth()` from `src/lib/api-auth.ts`, Pusher for real-time, React context (`ChatFloatingProvider`).

**Design doc:** `docs/plans/2026-03-05-chat-external-channels-design.md`

---

## Key patterns to follow

```typescript
// Auth pattern (ALL API routes)
const ctx = await requireAuth();
if (!ctx) return unauthorized();

// Response pattern
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ success: false, error: "message" }, { status: 400 });

// Prisma ID/UUID pattern
id: { @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid }

// Schema annotation — ALL chat models need this
@@schema("chat")
```

---

## Task 1: Prisma schema — new models and enum value

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add EXTERNAL to ChatChannelType enum**

Find the enum (around line 5425) and add the new value:
```prisma
enum ChatChannelType {
  INSTALLATION
  GROUP
  DIRECT
  EXTERNAL
}
```

**Step 2: Add accountId field to ChatChannel model**

In the `ChatChannel` model (around line 5432), add after `groupId`:
```prisma
  accountId      String?         @map("account_id") @db.Uuid
```

Also add the new relations at the bottom of the ChatChannel model's relation section:
```prisma
  participants   ChatChannelParticipant[]
  archives       ChatChannelArchive[]
```

**Step 3: Add ChatChannelParticipant model**

Add after the `ChatDmParticipant` model (around line 5623):
```prisma
// ── ChatChannelParticipant ──
// Used by EXTERNAL channels to track mixed ADMIN + CONTACT participants.
// (Internal DMs use ChatDmParticipant instead.)

model ChatChannelParticipant {
  id              String      @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  channelId       String      @map("channel_id") @db.Uuid
  participantType String      @map("participant_type") // "ADMIN" | "CONTACT"
  participantId   String      @map("participant_id")
  joinedAt        DateTime    @default(now()) @map("joined_at") @db.Timestamptz(6)

  channel ChatChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, participantType, participantId], map: "uq_chat_channel_participant")
  @@index([participantType, participantId], map: "idx_chat_channel_participants_participant")
  @@index([channelId], map: "idx_chat_channel_participants_channel")
  @@map("channel_participants")
  @@schema("chat")
}
```

**Step 4: Add ChatChannelArchive model**

Add immediately after `ChatChannelParticipant`:
```prisma
// ── ChatChannelArchive ──
// Per-user archiving (like Slack). Archiving one channel does NOT affect other participants.

model ChatChannelArchive {
  id         String      @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  channelId  String      @map("channel_id") @db.Uuid
  adminId    String      @map("admin_id")
  archivedAt DateTime    @default(now()) @map("archived_at") @db.Timestamptz(6)

  channel ChatChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, adminId], map: "uq_chat_channel_archive")
  @@index([adminId], map: "idx_chat_channel_archives_admin")
  @@map("channel_archives")
  @@schema("chat")
}
```

**Step 5: Run migration**

```bash
cd /Users/caco/Desktop/Cursor/opai
npx prisma migrate dev --name "chat_external_channels"
```

Expected: Migration created and applied successfully. Check that tables `chat.channel_participants` and `chat.channel_archives` were created, and `chat.chat_channels` has new `account_id` column.

**Step 6: Verify generated client**

```bash
npx prisma generate
```

Expected: Prisma Client regenerated. Check that `prisma.chatChannelParticipant` and `prisma.chatChannelArchive` are accessible.

**Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(chat): add EXTERNAL channel type, ChatChannelParticipant, ChatChannelArchive schema"
```

---

## Task 2: API — POST /api/chat/external (create external channel)

**Files:**
- Create: `src/app/api/chat/external/route.ts`

**Context:** Creates an EXTERNAL channel between one or more CrmContacts (`portalEnabled=true`) and one or more admins. Idempotent: if a channel with exactly the same participants already exists, returns it instead of creating a new one.

**Step 1: Create the file**

```typescript
// src/app/api/chat/external/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { accountId, contactIds, adminIds, name } = body as {
    accountId: string;
    contactIds: string[];
    adminIds?: string[];
    name?: string;
  };

  // Validate required fields
  if (!accountId || !contactIds?.length) {
    return NextResponse.json(
      { success: false, error: "accountId y al menos un contactId son requeridos" },
      { status: 400 }
    );
  }

  // Verify account belongs to tenant
  const account = await prisma.crmAccount.findFirst({
    where: { id: accountId, tenantId: ctx.tenantId },
    select: { id: true, name: true, status: true },
  });
  if (!account) {
    return NextResponse.json({ success: false, error: "Cuenta no encontrada" }, { status: 404 });
  }

  // Verify all contacts exist, belong to account, and have portal enabled
  const contacts = await prisma.crmContact.findMany({
    where: {
      id: { in: contactIds },
      accountId,
      portalEnabled: true,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (contacts.length !== contactIds.length) {
    return NextResponse.json(
      { success: false, error: "Uno o más contactos no tienen portal activo o no pertenecen a la cuenta" },
      { status: 400 }
    );
  }

  // Build full participant set: contacts + requested admins + current user
  const allAdminIds = Array.from(new Set([ctx.userId, ...(adminIds ?? [])]));

  // Check idempotency: find existing EXTERNAL channel with same account and same participants
  // Strategy: find channels for this account, then check participant sets match exactly
  const existingChannels = await prisma.chatChannel.findMany({
    where: {
      tenantId: ctx.tenantId,
      channelType: "EXTERNAL",
      accountId,
      isActive: true,
    },
    include: { participants: true },
  });

  for (const ch of existingChannels) {
    const existingAdmins = ch.participants
      .filter((p) => p.participantType === "ADMIN")
      .map((p) => p.participantId)
      .sort();
    const existingContacts = ch.participants
      .filter((p) => p.participantType === "CONTACT")
      .map((p) => p.participantId)
      .sort();
    const sameAdmins =
      JSON.stringify(existingAdmins) === JSON.stringify([...allAdminIds].sort());
    const sameContacts =
      JSON.stringify(existingContacts) === JSON.stringify([...contactIds].sort());
    if (sameAdmins && sameContacts) {
      return NextResponse.json({ success: true, data: { channelId: ch.id, existed: true } });
    }
  }

  // Build channel name: first contact's name + account name (if not provided)
  const channelName =
    name ??
    `${contacts[0].firstName} ${contacts[0].lastName} · ${account.name}`;

  // Create channel + participants in a transaction
  const channel = await prisma.$transaction(async (tx) => {
    const ch = await tx.chatChannel.create({
      data: {
        tenantId: ctx.tenantId,
        channelType: "EXTERNAL",
        accountId,
        name: channelName,
        isActive: true,
      },
    });

    const participantData = [
      ...allAdminIds.map((adminId) => ({
        channelId: ch.id,
        participantType: "ADMIN",
        participantId: adminId,
      })),
      ...contactIds.map((contactId) => ({
        channelId: ch.id,
        participantType: "CONTACT",
        participantId: contactId,
      })),
    ];

    await tx.chatChannelParticipant.createMany({ data: participantData });

    return ch;
  });

  return NextResponse.json({ success: true, data: { channelId: channel.id, existed: false } });
}
```

**Step 2: Manual test**

Using curl or the browser DevTools console, POST to `/api/chat/external` with:
```json
{
  "accountId": "<valid CrmAccount id>",
  "contactIds": ["<valid CrmContact id with portalEnabled=true>"]
}
```
Expected: `{ success: true, data: { channelId: "...", existed: false } }`

Re-send the same request → Expected: `{ success: true, data: { channelId: "...", existed: true } }`

**Step 3: Commit**

```bash
git add src/app/api/chat/external/route.ts
git commit -m "feat(chat): POST /api/chat/external — create or get EXTERNAL channel"
```

---

## Task 3: API — Archive endpoints

**Files:**
- Create: `src/app/api/chat/channels/[id]/archive/route.ts`

**Step 1: Create the file**

```typescript
// src/app/api/chat/channels/[id]/archive/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

// POST → archive this channel for the current user
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;

  // Verify channel exists and belongs to tenant
  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  await prisma.chatChannelArchive.upsert({
    where: { channelId_adminId: { channelId, adminId: ctx.userId } },
    create: { channelId, adminId: ctx.userId },
    update: { archivedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

// DELETE → unarchive this channel for the current user
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;

  await prisma.chatChannelArchive.deleteMany({
    where: { channelId, adminId: ctx.userId },
  });

  return NextResponse.json({ success: true });
}
```

**Note on the `@@unique` name:** The upsert uses `channelId_adminId` which Prisma derives from the `@@unique([channelId, adminId])` constraint. If Prisma generates a different name (check with `prisma generate`), update accordingly.

**Step 2: Manual test**

POST `/api/chat/channels/<id>/archive` → `{ success: true }`
Check DB: `SELECT * FROM chat.channel_archives WHERE admin_id = '<your id>';`

DELETE `/api/chat/channels/<id>/archive` → `{ success: true }`
Check DB: row deleted.

**Step 3: Commit**

```bash
git add src/app/api/chat/channels/[id]/archive/route.ts
git commit -m "feat(chat): archive/unarchive channel endpoints (per-user)"
```

---

## Task 4: API — DELETE /api/chat/channels/[id] (permanent delete, admin/owner only)

**Files:**
- Modify: `src/app/api/chat/channels/[id]/route.ts`

**Step 1: Read the existing file first**

Open `src/app/api/chat/channels/[id]/route.ts` to understand its current structure (GET handler). Add the DELETE handler alongside it.

**Step 2: Add DELETE handler**

```typescript
// Add this export to src/app/api/chat/channels/[id]/route.ts

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  // Only admin or owner can permanently delete
  if (ctx.userRole !== "admin" && ctx.userRole !== "owner") {
    return NextResponse.json(
      { success: false, error: "Solo administradores pueden eliminar canales permanentemente" },
      { status: 403 }
    );
  }

  const { id: channelId } = await params;

  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  // Hard delete — cascade in schema removes messages, participants, archives, read cursors
  await prisma.chatChannel.delete({ where: { id: channelId } });

  return NextResponse.json({ success: true });
}
```

**Step 3: Manual test**

As a regular user → DELETE `/api/chat/channels/<id>` → 403
As admin/owner → DELETE `/api/chat/channels/<id>` → `{ success: true }`
Verify channel and messages are gone from DB.

**Step 4: Commit**

```bash
git add src/app/api/chat/channels/[id]/route.ts
git commit -m "feat(chat): DELETE channel endpoint with admin/owner permission guard"
```

---

## Task 5: API — Participants endpoints

**Files:**
- Create: `src/app/api/chat/channels/[id]/participants/route.ts`

**Step 1: Create the file**

```typescript
// src/app/api/chat/channels/[id]/participants/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

// POST → add participant to EXTERNAL channel
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;
  const { participantType, participantId } = await req.json() as {
    participantType: "ADMIN" | "CONTACT";
    participantId: string;
  };

  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId, channelType: "EXTERNAL" },
    include: { participants: true },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  // Regular users can only add to channels they already participate in
  const isParticipant = channel.participants.some(
    (p) => p.participantType === "ADMIN" && p.participantId === ctx.userId
  );
  if (!isParticipant && ctx.userRole !== "admin" && ctx.userRole !== "owner") {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  await prisma.chatChannelParticipant.upsert({
    where: {
      channelId_participantType_participantId: {
        channelId,
        participantType,
        participantId,
      },
    },
    create: { channelId, participantType, participantId },
    update: {},
  });

  return NextResponse.json({ success: true });
}
```

**Step 2: Create DELETE for removing participants**

Add to the same file:
```typescript
// DELETE /api/chat/channels/[id]/participants?participantType=ADMIN&participantId=xxx
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (ctx.userRole !== "admin" && ctx.userRole !== "owner") {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { id: channelId } = await params;
  const url = new URL(req.url);
  const participantType = url.searchParams.get("participantType") as "ADMIN" | "CONTACT";
  const participantId = url.searchParams.get("participantId") ?? "";

  await prisma.chatChannelParticipant.deleteMany({
    where: { channelId, participantType, participantId },
  });

  return NextResponse.json({ success: true });
}
```

**Step 3: Commit**

```bash
git add src/app/api/chat/channels/[id]/participants/route.ts
git commit -m "feat(chat): participant management endpoints for EXTERNAL channels"
```

---

## Task 6: Update GET /api/chat/channels to support EXTERNAL type and archiving

**Files:**
- Modify: `src/app/api/chat/channels/route.ts`

**Step 1: Read the existing file completely before editing**

Open `src/app/api/chat/channels/route.ts` and understand the full query flow.

**Step 2: Update the GET handler**

The key changes are:
1. Accept `?type=EXTERNAL` filter
2. For EXTERNAL channels, query by `ChatChannelParticipant` where `participantType=ADMIN` and `participantId=ctx.userId`
3. Exclude channels the current user has archived (unless `?archived=true`)
4. Include `isArchivedByMe` field in the response
5. For EXTERNAL channels, include `account: { id, name, status }` so frontend can sort into Prospectos/Clientes sections

**The EXTERNAL channel query block to add** (alongside the existing GROUP/INSTALLATION/DIRECT blocks):

```typescript
// Inside the GET handler, in the section that builds the channels array

// Fetch EXTERNAL channels where current admin is a participant
if (!typeFilter || typeFilter === "EXTERNAL") {
  const externalChannels = await prisma.chatChannel.findMany({
    where: {
      tenantId: ctx.tenantId,
      channelType: "EXTERNAL",
      isActive: true,
      participants: {
        some: {
          participantType: "ADMIN",
          participantId: ctx.userId,
        },
      },
    },
    include: {
      participants: true,
    },
  });
  channels.push(...externalChannels);
}
```

**Adding isArchivedByMe:** After fetching all channels, get the admin's archived channel IDs:

```typescript
// After fetching all channels:
const archivedSet = new Set(
  (
    await prisma.chatChannelArchive.findMany({
      where: { adminId: ctx.userId, channelId: { in: channels.map((c) => c.id) } },
      select: { channelId: true },
    })
  ).map((a) => a.channelId)
);

// Filter archived unless ?archived=true
const showArchived = url.searchParams.get("archived") === "true";
const filteredChannels = showArchived
  ? channels.filter((c) => archivedSet.has(c.id))
  : channels.filter((c) => !archivedSet.has(c.id));
```

**For EXTERNAL channels, fetch account info:**

```typescript
const externalAccountIds = filteredChannels
  .filter((c) => c.channelType === "EXTERNAL" && c.accountId)
  .map((c) => c.accountId as string);

const accountsMap = new Map(
  (
    await prisma.crmAccount.findMany({
      where: { id: { in: externalAccountIds } },
      select: { id: true, name: true, status: true },
    })
  ).map((a) => [a.id, a])
);
```

**Add to the response object per channel:**

```typescript
// In the normalization step, add:
isArchivedByMe: archivedSet.has(channel.id),
account: channel.accountId ? (accountsMap.get(channel.accountId) ?? null) : null,
// For EXTERNAL channels, externalParticipants lists everyone
externalParticipants: channel.channelType === "EXTERNAL"
  ? channel.participants ?? []
  : undefined,
```

**Step 3: Commit**

```bash
git add src/app/api/chat/channels/route.ts
git commit -m "feat(chat): support EXTERNAL type, archiving filter, and isArchivedByMe in channels GET"
```

---

## Task 7: API — GET /api/chat/archived

**Files:**
- Create: `src/app/api/chat/archived/route.ts`

**Step 1: Create the file**

This endpoint is a convenience alias — it's the same as `GET /api/chat/channels?archived=true`. But having a dedicated URL makes it cleaner for the frontend to fetch.

```typescript
// src/app/api/chat/archived/route.ts
import { NextResponse } from "next/server";

// Convenience redirect to the main channels endpoint with archived=true filter
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channelsUrl = new URL("/api/chat/channels", url.origin);
  channelsUrl.searchParams.set("archived", "true");

  // Forward the request to the channels endpoint
  const res = await fetch(channelsUrl.toString(), {
    headers: req.headers,
  });
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/archived/route.ts
git commit -m "feat(chat): GET /api/chat/archived convenience endpoint"
```

---

## Task 8: API — POST /api/crm/contacts/[id]/chat

**Files:**
- Create: `src/app/api/crm/contacts/[id]/chat/route.ts`

**Step 1: Create the file**

```typescript
// src/app/api/crm/contacts/[id]/chat/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: contactId } = await params;

  // Fetch contact and verify portal is enabled
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId },
    include: { account: { select: { id: true, name: true, status: true, tenantId: true } } },
  });

  if (!contact || contact.account.tenantId !== ctx.tenantId) {
    return NextResponse.json({ success: false, error: "Contacto no encontrado" }, { status: 404 });
  }

  if (!contact.portalEnabled) {
    return NextResponse.json(
      { success: false, error: "El contacto no tiene acceso al portal activo" },
      { status: 400 }
    );
  }

  // Delegate to POST /api/chat/external (reuse idempotency logic)
  const externalRes = await fetch(
    new URL("/api/chat/external", process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass session cookie so requireAuth works in the forwarded request
        cookie: _req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        accountId: contact.accountId,
        contactIds: [contactId],
      }),
    }
  );

  const result = await externalRes.json();
  return NextResponse.json(result, { status: externalRes.status });
}
```

**Note:** The internal fetch approach may not carry cookies reliably in all environments. If it doesn't work, inline the channel creation logic (copy from Task 2) rather than forwarding the request.

**Step 2: Commit**

```bash
git add src/app/api/crm/contacts/[id]/chat/route.ts
git commit -m "feat(crm): POST /api/crm/contacts/[id]/chat — start chat from CRM contact page"
```

---

## Task 9: Update ChatFloatingProvider — types and state

**Files:**
- Modify: `src/components/chat/ChatFloatingProvider.tsx`
- Modify: `src/components/chat/ChatFloatingPanel.tsx` (types only in this task)

**Step 1: Update ChatFloatingChannel type**

In `src/components/chat/ChatFloatingProvider.tsx`, update the `ChatFloatingChannel` type (around line 17) to add new fields:

```typescript
export type ChatFloatingChannel = {
  id: string;
  name: string;
  channelType: string; // "DIRECT" | "GROUP" | "INSTALLATION" | "EXTERNAL"
  groupId: string | null;
  installationId: string | null;
  accountId: string | null;        // ← new
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isArchivedByMe: boolean;          // ← new
  group: { id: string; color: string; slug: string } | null;
  installation: {
    id: string;
    name: string;
    account: { id: string; name: string } | null;
  } | null;
  account: {                         // ← new (for EXTERNAL channels)
    id: string;
    name: string;
    status: string; // "prospect" | "client_active" | "client_inactive"
  } | null;
  dmParticipant: {
    id: string;
    name: string;
    email: string;
    image: null;
  } | null;
};
```

**Step 2: Update context interface**

Add new methods to `ChatFloatingContextValue`:
```typescript
archiveChannel: (channelId: string) => Promise<void>;
unarchiveChannel: (channelId: string) => Promise<void>;
deleteChannel: (channelId: string) => Promise<void>;
```

**Step 3: Implement archiveChannel, unarchiveChannel, deleteChannel in the provider**

```typescript
const archiveChannel = useCallback(async (channelId: string) => {
  await fetch(`/api/chat/channels/${channelId}/archive`, { method: "POST" });
  setChannels((prev) => prev.filter((c) => c.id !== channelId));
}, []);

const unarchiveChannel = useCallback(async (channelId: string) => {
  await fetch(`/api/chat/channels/${channelId}/archive`, { method: "DELETE" });
  // Refresh channels to bring the unarchived one back
  await fetchChannels();
}, [fetchChannels]);

const deleteChannel = useCallback(async (channelId: string) => {
  await fetch(`/api/chat/channels/${channelId}`, { method: "DELETE" });
  setChannels((prev) => prev.filter((c) => c.id !== channelId));
}, []);
```

**Step 4: Add archived channels state**

```typescript
const [archivedChannels, setArchivedChannels] = useState<ChatFloatingChannel[]>([]);

const fetchArchivedChannels = useCallback(async () => {
  try {
    const res = await fetch("/api/chat/archived");
    if (!res.ok) return;
    const json = await res.json();
    if (json.success) setArchivedChannels(json.data);
  } catch {}
}, []);
```

Add `archivedChannels`, `fetchArchivedChannels` to the context value and interface.

**Step 5: Commit**

```bash
git add src/components/chat/ChatFloatingProvider.tsx
git commit -m "feat(chat): extend ChatFloatingProvider with EXTERNAL type, archive/delete actions"
```

---

## Task 10: ChatFloatingPanel — new sections and "..." menu

**Files:**
- Modify: `src/components/chat/ChatFloatingPanel.tsx`

**Step 1: Read the full file before editing**

Open `src/components/chat/ChatFloatingPanel.tsx` (all 625 lines) and understand the `ChannelSection` component.

**Step 2: Derive section data from channels**

In the panel component, after getting `ctx`, compute:
```typescript
const prospectChannels = ctx.channels.filter(
  (c) => c.channelType === "EXTERNAL" && c.account?.status === "prospect"
);
const clientChannels = ctx.channels.filter(
  (c) =>
    c.channelType === "EXTERNAL" &&
    (c.account?.status === "client_active" || c.account?.status === "client_inactive")
);
```

**Step 3: Add Prospectos section**

After the Instalaciones `<ChannelSection>`, add:
```tsx
{/* ── Prospectos ── */}
{(prospectChannels.length > 0 || !search) && (
  <ChannelSection
    label="Prospectos"
    icon={<Sprout className="h-3.5 w-3.5 text-green-500" />}
    channels={prospectChannels}
    collapsed={collapsedSections.has("prospects")}
    onToggle={() => toggleSection("prospects")}
    onSelectChannel={ctx.selectChannel}
    getDisplayName={(ch) => ch.name}
    onArchive={(id) => ctx.archiveChannel(id)}
    canDelete={userRole === "admin" || userRole === "owner"}
    onDelete={(id) => handleDeleteChannel(id)}
  />
)}
```

**Step 4: Add Clientes section**

After Prospectos:
```tsx
{/* ── Clientes ── */}
{(clientChannels.length > 0 || !search) && (
  <ChannelSection
    label="Clientes"
    icon={<Handshake className="h-3.5 w-3.5 text-blue-500" />}
    channels={clientChannels}
    collapsed={collapsedSections.has("clients")}
    onToggle={() => toggleSection("clients")}
    onSelectChannel={ctx.selectChannel}
    getDisplayName={(ch) => ch.name}
    onArchive={(id) => ctx.archiveChannel(id)}
    canDelete={userRole === "admin" || userRole === "owner"}
    onDelete={(id) => handleDeleteChannel(id)}
  />
)}
```

**Step 5: Add Archivados section**

After Clientes (collapsed by default):
```tsx
{/* ── Archivados ── */}
<ChannelSection
  label="Archivados"
  icon={<Archive className="h-3.5 w-3.5 text-muted-foreground" />}
  channels={ctx.archivedChannels ?? []}
  collapsed={collapsedSections.has("archived")}
  onToggle={() => {
    toggleSection("archived");
    if (collapsedSections.has("archived")) {
      ctx.fetchArchivedChannels?.();
    }
  }}
  onSelectChannel={ctx.selectChannel}
  getDisplayName={(ch) => ch.name}
  onUnarchive={(id) => ctx.unarchiveChannel(id)}
  canDelete={userRole === "admin" || userRole === "owner"}
  onDelete={(id) => handleDeleteChannel(id)}
  isArchivedSection
/>
```

**Step 6: Add "..." menu to ChannelSection items**

Extend the `ChannelSection` component to accept `onArchive?`, `onUnarchive?`, `canDelete?`, `onDelete?`, `isArchivedSection?` props. For each channel row, add a `MoreHorizontal` button that opens a `DropdownMenu`:

```tsx
// Inside channel row, on hover (group/hover:opacity-100 opacity-0 pattern):
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-44">
    {!isArchivedSection && onArchive && (
      <DropdownMenuItem onClick={() => onArchive(ch.id)}>
        <Archive className="h-3.5 w-3.5 mr-2" />
        Archivar conversación
      </DropdownMenuItem>
    )}
    {isArchivedSection && onUnarchive && (
      <DropdownMenuItem onClick={() => onUnarchive(ch.id)}>
        <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
        Desarchivar
      </DropdownMenuItem>
    )}
    {canDelete && onDelete && (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(ch.id)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Eliminar permanentemente
        </DropdownMenuItem>
      </>
    )}
  </DropdownMenuContent>
</DropdownMenu>
```

**Step 7: Add delete confirmation dialog**

Add a state `channelToDelete: string | null` and an `AlertDialog` at the bottom of the panel (before `</div>`):
```tsx
const [channelToDelete, setChannelToDelete] = useState<string | null>(null);

const handleDeleteChannel = (id: string) => setChannelToDelete(id);
const confirmDelete = async () => {
  if (!channelToDelete) return;
  await ctx.deleteChannel(channelToDelete);
  setChannelToDelete(null);
  if (ctx.selectedChannelId === channelToDelete) ctx.selectChannel(null);
};

// JSX:
<AlertDialog open={!!channelToDelete} onOpenChange={() => setChannelToDelete(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta acción es permanente y no se puede deshacer. Se eliminarán todos los mensajes del canal para todos los participantes.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
        Eliminar permanentemente
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Step 8: Add icons to imports**

Add to lucide-react imports: `Archive`, `ArchiveRestore`, `ArchiveX`, `Handshake`, `MoreHorizontal`, `Sprout`, `Trash2`.
Add to UI imports: `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`.

**Step 9: Commit**

```bash
git add src/components/chat/ChatFloatingPanel.tsx
git commit -m "feat(chat): add Prospectos/Clientes/Archivados sections and archive/delete menu"
```

---

## Task 11: New external chat creation modal

**Files:**
- Create: `src/components/chat/NewExternalChatModal.tsx`
- Modify: `src/components/chat/ChatFloatingPanel.tsx`

**Step 1: Create the modal component**

```typescript
// src/components/chat/NewExternalChatModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserPlus } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Account {
  id: string;
  name: string;
  status: string;
  contacts: Contact[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (channelId: string) => void;
  defaultStatus?: "prospect" | "client_active"; // pre-filter by section
}

export function NewExternalChatModal({ open, onClose, onCreated, defaultStatus }: Props) {
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedAccount(null);
      setSelectedContactIds([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ search, portalEnabled: "true" });
    if (defaultStatus) params.set("status", defaultStatus);
    fetch(`/api/crm/accounts?${params}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setAccounts(j.data); })
      .finally(() => setLoading(false));
  }, [open, search, defaultStatus]);

  const toggleContact = (id: string) =>
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const handleCreate = async () => {
    if (!selectedAccount || !selectedContactIds.length) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          contactIds: selectedContactIds,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onCreated(json.data.channelId);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo chat externo</DialogTitle>
        </DialogHeader>

        {!selectedAccount ? (
          // Step 1: Select account
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cuenta..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm"
                    onClick={() => setSelectedAccount(account)}
                  >
                    <div className="font-medium">{account.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{account.status.replace("_", " ")}</div>
                  </button>
                ))}
                {accounts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">No se encontraron cuentas con portal activo</p>
                )}
              </div>
            )}
          </div>
        ) : (
          // Step 2: Select contacts
          <div className="space-y-3">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedAccount(null)}
            >
              ← {selectedAccount.name}
            </button>
            <p className="text-sm font-medium">Seleccionar contactos</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {selectedAccount.contacts.filter((c) => /* portalEnabled check done server-side */ true).map((contact) => {
                const selected = selectedContactIds.includes(contact.id);
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleContact(contact.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                      selected ? "bg-primary/10 text-primary" : "hover:bg-accent"
                    }`}
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-medium">{contact.firstName} {contact.lastName}</div>
                      {contact.email && <div className="text-xs text-muted-foreground">{contact.email}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              className="w-full"
              disabled={!selectedContactIds.length || creating}
              onClick={handleCreate}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear chat
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Note:** The `/api/crm/accounts` endpoint needs to support `?portalEnabled=true` filter returning contacts. Check if it exists; if not, add the filter to the existing accounts list endpoint. The contacts should be included in the account data when `portalEnabled=true` is passed.

**Step 2: Add the modal to ChatFloatingPanel**

In `ChatFloatingPanel.tsx`, add state and trigger:
```typescript
const [newChatModal, setNewChatModal] = useState<{ open: boolean; defaultStatus?: "prospect" | "client_active" }>({ open: false });
```

Add `+` button in Prospectos and Clientes section headers (pass to `ChannelSection` as `onNewChat` prop), and:
```tsx
<NewExternalChatModal
  open={newChatModal.open}
  defaultStatus={newChatModal.defaultStatus}
  onClose={() => setNewChatModal({ open: false })}
  onCreated={(channelId) => {
    ctx.refreshChannels();
    ctx.selectChannel(channelId);
  }}
/>
```

**Step 3: Commit**

```bash
git add src/components/chat/NewExternalChatModal.tsx src/components/chat/ChatFloatingPanel.tsx
git commit -m "feat(chat): NewExternalChatModal for creating prospect/client conversations"
```

---

## Task 12: CRM integration — chat button on account and contact pages

**Files:**
- Find and modify the CrmAccount detail page/component
- Find and modify the CrmContact detail page/component

**Step 1: Find the correct files**

Run searches to find the account and contact detail components:
```bash
grep -r "CrmAccount\|account detail\|accountDetail" src/app --include="*.tsx" -l
grep -r "CrmContact\|contact detail\|contactDetail" src/app --include="*.tsx" -l
```

**Step 2: Add ChatButton component**

Create a small reusable button:
```typescript
// src/components/chat/StartChatButton.tsx
"use client";

import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatFloatingContext } from "./ChatFloatingProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  contactId: string;
  portalEnabled: boolean;
}

export function StartChatButton({ contactId, portalEnabled }: Props) {
  const ctx = useChatFloatingContext();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!portalEnabled || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/chat`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        ctx.openPanel();
        ctx.selectChannel(json.data.channelId);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!portalEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size="sm" disabled>
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Chat
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>El contacto no tiene portal activo</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4 mr-1.5" />
      )}
      Chat
    </Button>
  );
}
```

**Step 3: Add `<StartChatButton>` to contact detail**

In the contact detail page/component, import and add alongside other action buttons (Edit, Delete, etc.):
```tsx
import { StartChatButton } from "@/components/chat/StartChatButton";

// In the actions area:
<StartChatButton contactId={contact.id} portalEnabled={contact.portalEnabled} />
```

**Step 4: Add chat button to account detail**

For the account detail page, show all portal-enabled contacts with chat buttons, or a single "Iniciar chat" that opens the `NewExternalChatModal` with that account pre-selected.

**Step 5: Commit**

```bash
git add src/components/chat/StartChatButton.tsx
git add <contact-detail-file> <account-detail-file>
git commit -m "feat(crm): add chat button to account and contact detail pages"
```

---

## Final verification checklist

1. **Schema:** Run `npx prisma studio` and verify tables `channel_participants` and `channel_archives` exist in `chat` schema
2. **EXTERNAL channel creation:** Create a channel via `POST /api/chat/external` → verify it appears in `GET /api/chat/channels?type=EXTERNAL`
3. **Section routing:** Create channels for both prospect and client accounts → verify they appear in correct sections in the panel
4. **Status migration:** Update a CrmAccount from `prospect` → `client_active` via Prisma Studio → refresh chat panel → verify channel moved from Prospectos to Clientes section
5. **Archive (personal):** Archive a channel as User A → verify it disappears for User A but User B still sees it → verify it appears in User A's Archivados section
6. **Unarchive:** Click Desarchivar → channel returns to main section
7. **Delete (admin only):** As admin, delete a channel → confirm dialog → verify channel gone for all users → verify regular user doesn't see the delete option
8. **CRM button:** Open a CrmContact with `portalEnabled=true` → click Chat → panel opens with conversation
9. **Disabled state:** Open a CrmContact with `portalEnabled=false` → button is disabled with tooltip
10. **Idempotency:** Click Chat button twice on same contact → same channel opened, no duplicate channels in DB
