# Chat Dual por Instalacion + Admin Delete — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split each installation into two chat channels (Reportes for guards+clients+admins, Interno for clients+admins only), and allow owner/admin to delete any message or clear a channel.

**Architecture:** Add `subType` field to ChatChannel model. Modify channel creation to produce pairs. Update guard portal to exclude "interno" channels. Extend DELETE message handler for admin privilege. New bulk-delete endpoint.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, Pusher, Tailwind CSS, TypeScript.

**Design doc:** `docs/plans/2026-03-05-chat-dual-channels-admin-delete-design.md`

---

## Phase 1: Data Layer

### Task 1: Add subType field to ChatChannel model

**Files:**
- Modify: `prisma/schema.prisma:5482-5512`

**Step 1: Add subType field and change unique constraint**

In the `ChatChannel` model, add `subType` after `accountId` (line 5488) and change the `installationId` field from `@unique` to part of a compound unique:

```prisma
  // Replace line 5486:
  //   installationId     String?         @unique @map("installation_id") @db.Uuid
  // With:
  installationId     String?         @map("installation_id") @db.Uuid
  subType            String?         @map("sub_type")
```

Then at the bottom of the model (before `@@map`), replace the `@@index([installationId]` line and add:

```prisma
  @@unique([installationId, subType], map: "chat_channels_installation_sub_type_key")
```

Remove the old `@@index([installationId])` line since the unique index covers it.

**Step 2: Generate Prisma client**

Run: `npx prisma generate`

**Step 3: Create and apply migration**

Run: `npx prisma migrate dev --name add_chat_channel_sub_type`

This will:
- Add `sub_type` column
- Drop the old unique constraint on `installation_id`
- Add the new composite unique on `(installation_id, sub_type)`

**Step 4: Run migration script to rename existing channels and create pairs**

Create a one-time migration script. Add to the migration SQL (edit the generated migration before applying, or run manually):

```sql
-- Rename existing installation channels to "- Reportes"
UPDATE chat.channels
SET sub_type = 'reportes', name = name || ' - Reportes'
WHERE channel_type = 'INSTALLATION' AND sub_type IS NULL;

-- Create matching "- Interno" channels for each existing installation channel
INSERT INTO chat.channels (id, tenant_id, channel_type, installation_id, sub_type, name, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  tenant_id,
  'INSTALLATION',
  installation_id,
  'interno',
  REPLACE(name, ' - Reportes', '') || ' - Interno',
  is_active,
  NOW(),
  NOW()
FROM chat.channels
WHERE channel_type = 'INSTALLATION' AND sub_type = 'reportes';
```

---

### Task 2: Add subType to chat-types.ts

**Files:**
- Modify: `src/lib/chat-types.ts:12-44`

**Step 1: Add subType to ChatChannelData**

After `installationId` (line 16), add:

```typescript
  subType: "reportes" | "interno" | null;
```

---

## Phase 2: Channel Creation

### Task 3: Update installation activation to create dual channels

**Files:**
- Modify: `src/app/api/crm/installations/[id]/route.ts:186-214`

**Step 1: Replace single channel creation with dual creation**

Replace the channel creation block (lines 186-214) with:

```typescript
    // Auto-manage chat channels when chatEnabled changes
    if (payload.chatEnabled !== undefined) {
      if (payload.chatEnabled) {
        // Check for existing channels (reportes + interno)
        const existingChannels = await prisma.chatChannel.findMany({
          where: { installationId: id },
        });
        const hasReportes = existingChannels.some(c => c.subType === "reportes");
        const hasInterno = existingChannels.some(c => c.subType === "interno");

        // Reactivate existing channels
        if (existingChannels.length > 0) {
          await prisma.chatChannel.updateMany({
            where: { installationId: id },
            data: { isActive: true },
          });
        }

        // Create missing channels
        const toCreate = [];
        if (!hasReportes) {
          toCreate.push({
            tenantId: ctx.tenantId,
            installationId: id,
            subType: "reportes",
            name: `${installation.name} - Reportes`,
          });
        }
        if (!hasInterno) {
          toCreate.push({
            tenantId: ctx.tenantId,
            installationId: id,
            subType: "interno",
            name: `${installation.name} - Interno`,
          });
        }
        if (toCreate.length > 0) {
          await prisma.chatChannel.createMany({ data: toCreate });
        }
      } else {
        // Deactivate all channels for this installation
        await prisma.chatChannel.updateMany({
          where: { installationId: id },
          data: { isActive: false },
        });
      }
    }
```

Note: The `findUnique` on `installationId` must change to `findMany` since the unique constraint now includes `subType`.

---

### Task 4: Update provision route to create dual channels

**Files:**
- Modify: `src/app/api/chat/channels/provision/route.ts`

**Step 1: Replace full provision logic**

Replace the body of the POST handler with logic that:
1. Finds installations missing EITHER reportes or interno channels
2. Creates the missing ones

```typescript
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Get all active installations for the tenant
    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true },
    });

    // Get all existing installation channels
    const existingChannels = await prisma.chatChannel.findMany({
      where: {
        tenantId: ctx.tenantId,
        channelType: "INSTALLATION",
      },
      select: { installationId: true, subType: true },
    });

    const existingSet = new Set(
      existingChannels.map(c => `${c.installationId}:${c.subType}`)
    );

    const toCreate: Array<{
      tenantId: string;
      installationId: string;
      subType: string;
      name: string;
    }> = [];

    for (const inst of installations) {
      if (!existingSet.has(`${inst.id}:reportes`)) {
        toCreate.push({
          tenantId: ctx.tenantId,
          installationId: inst.id,
          subType: "reportes",
          name: `${inst.name} - Reportes`,
        });
      }
      if (!existingSet.has(`${inst.id}:interno`)) {
        toCreate.push({
          tenantId: ctx.tenantId,
          installationId: inst.id,
          subType: "interno",
          name: `${inst.name} - Interno`,
        });
      }
    }

    if (toCreate.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0 },
        meta: { message: "Todas las instalaciones ya tienen ambos canales" },
      });
    }

    const created = await prisma.chatChannel.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: { created: created.count },
      meta: { message: `Se crearon ${created.count} canales de chat` },
    });
  } catch (err: any) {
    console.error("Error provisioning chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
```

---

## Phase 3: Access Control

### Task 5: Filter guard portal to exclude interno channels

**Files:**
- Modify: `src/app/api/portal/guardia/chat/channels/route.ts`

**Step 1: Add subType filter to the channel query**

In the `findMany` where clause for channels, add `subType: { not: "interno" }` (or equivalently `NOT: { subType: "interno" }`):

Find the `prisma.chatChannel.findMany` call and add to its `where`:

```typescript
  NOT: { subType: "interno" },
```

This ensures guards never see the internal channels.

**Step 2: Include subType in the select clause**

Add `subType: true` to the channel select so the portal can display it if needed.

---

### Task 6: Include subType in admin channels API response

**Files:**
- Modify: `src/app/api/chat/channels/route.ts`

**Step 1: Add subType to the select clause**

In the GET handler's `prisma.chatChannel.findMany` select, add `subType: true`.

This ensures the frontend receives the subType to split installation channels into groups.

---

## Phase 4: Admin Channel List UI

### Task 7: Split installation channels into Reportes and Interno groups

**Files:**
- Modify: `src/components/chat/ChatChannelList.tsx:260-266` and `446-461`

**Step 1: Split installationChannels into two groups**

Replace the derived data (line 260-266):

```typescript
  const { directChannels, groupChannels, installationReportesChannels, installationInternoChannels, prospectChannels, clientChannels } = useMemo(() => ({
    directChannels: processedChannels.filter((ch) => ch.channelType === "DIRECT"),
    groupChannels: processedChannels.filter((ch) => ch.channelType === "GROUP"),
    installationReportesChannels: processedChannels.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType !== "interno"),
    installationInternoChannels: processedChannels.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType === "interno"),
    prospectChannels: processedChannels.filter((ch) => ch.channelType === "EXTERNAL" && ch.account?.status === "prospect"),
    clientChannels: processedChannels.filter((ch) => ch.channelType === "EXTERNAL" && ch.account?.status !== "prospect"),
  }), [processedChannels]);
```

Note: `subType !== "interno"` catches both `"reportes"` and `null` (legacy fallback).

**Step 2: Add collapsed state for new sections**

In the `collapsed` initial state (line 111-118), add:

```typescript
  installation_reportes: true,
  installation_interno: true,
```

Remove the old `installation: true`.

**Step 3: Replace the single Installations section (lines 446-461) with two sections**

```tsx
            {/* Instalaciones - Reportes */}
            {installationReportesChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Instalaciones - Reportes"
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  count={installationReportesChannels.length}
                  unreadCount={sectionUnread(installationReportesChannels)}
                  collapsed={!shouldExpand("installation_reportes")}
                  onToggle={() => toggleSection("installation_reportes")}
                />
                {shouldExpand("installation_reportes") && (
                  <div>{renderChannelItems(installationReportesChannels, { showArchive: true, showDelete: false })}</div>
                )}
              </div>
            )}

            {/* Instalaciones - Interno */}
            {installationInternoChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Instalaciones - Interno"
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  count={installationInternoChannels.length}
                  unreadCount={sectionUnread(installationInternoChannels)}
                  collapsed={!shouldExpand("installation_interno")}
                  onToggle={() => toggleSection("installation_interno")}
                />
                {shouldExpand("installation_interno") && (
                  <div>{renderChannelItems(installationInternoChannels, { showArchive: true, showDelete: false })}</div>
                )}
              </div>
            )}
```

---

## Phase 5: Admin Message Deletion

### Task 8: Allow admin/owner to delete any message

**Files:**
- Modify: `src/app/api/chat/channels/[id]/messages/[messageId]/route.ts:218-278`

**Step 1: Add role check before soft-delete**

The current handler already soft-deletes without sender check. Verify it works for any authenticated admin. If there IS a sender check, add an override for owner/admin roles:

After finding the message (line 246), before the soft-delete (line 255), add:

```typescript
    // Only sender can delete their own message, unless admin/owner
    const isOwnMessage = message.senderType === "ADMIN" && message.senderAdminId === ctx.userId;
    const isPrivileged = ctx.userRole === "owner" || ctx.userRole === "admin";

    if (!isOwnMessage && !isPrivileged) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para eliminar este mensaje" },
        { status: 403 }
      );
    }
```

---

### Task 9: Add bulk delete (clear channel) endpoint

**Files:**
- Modify: `src/app/api/chat/channels/[id]/messages/route.ts`

**Step 1: Add DELETE handler to the existing messages route**

Add a new export at the bottom of the file:

```typescript
// ── DELETE — Bulk soft-delete all messages in channel (admin/owner only) ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden limpiar conversaciones" },
        { status: 403 }
      );
    }

    const { id: channelId } = await params;

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const result = await prisma.chatMessage.updateMany({
      where: {
        channelId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
      },
    });

    // Trigger Pusher event for connected clients
    try {
      const { triggerChatEvent } = await import("@/lib/chat");
      await triggerChatEvent(channelId, "messages-cleared", {
        clearedBy: ctx.userId,
        count: result.count,
      });
    } catch (err) {
      console.error("Error triggering messages-cleared event:", err);
    }

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
    });
  } catch (err: any) {
    console.error("Error clearing channel messages:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
```

---

### Task 10: Add Pusher event type for messages-cleared

**Files:**
- Modify: `src/lib/chat-types.ts`

**Step 1: Add PusherMessagesClearedEvent type**

After `PusherMessageDeletedEvent` (line 116), add:

```typescript
export type PusherMessagesClearedEvent = {
  clearedBy: string;
  count: number;
};
```

---

## Phase 6: UI for Admin Delete

### Task 11: Add "delete any message" and "clear conversation" UI

**Files:**
- Modify: The chat conversation component (wherever messages are rendered and their context menus live)

**Step 1: Find the message context menu**

Look in the chat conversation component for the message dropdown/context menu. Add a "Eliminar" option that calls `DELETE /api/chat/channels/{channelId}/messages/{messageId}` if:
- The user is the sender (already exists), OR
- `userRole` is `"owner"` or `"admin"`

**Step 2: Add "Limpiar conversacion" button**

In the conversation header or channel dropdown, add a button visible only to owner/admin:

```tsx
{(userRole === "owner" || userRole === "admin") && (
  <button onClick={() => setShowClearConfirm(true)}>
    Limpiar conversacion
  </button>
)}
```

With a confirmation dialog that calls `DELETE /api/chat/channels/{channelId}/messages`.

**Step 3: Handle `messages-cleared` Pusher event**

In the Pusher subscription for the channel, listen for `messages-cleared` and clear the local messages array:

```typescript
channel.bind("messages-cleared", () => {
  setMessages([]);
});
```

---

## Phase 7: Verify

### Task 12: TypeScript check and build

**Step 1: Run type check**

Run: `npx tsc --noEmit`

Expected: No new errors in modified files.

**Step 2: Run build**

Run: `npx next build`

Expected: Build succeeds.

---

## Dependency Graph

```
Task 1 (schema) ──┬──> Task 3 (installation create)
                   ├──> Task 4 (provision)
                   ├──> Task 5 (guard filter)
                   └──> Task 6 (admin API subType)
Task 2 (types) ───────> Task 7 (channel list UI)
Task 6 ───────────────> Task 7
Task 8 (single delete) ─> Task 11 (UI)
Task 9 (bulk delete) ──> Task 11
Task 10 (pusher type) ─> Task 11
All ──────────────────> Task 12 (verify)
```

Tasks 1-2 can run in parallel. Tasks 3-6 can run in parallel after Task 1. Tasks 8-10 can run in parallel. Task 7 depends on 2+6. Task 11 depends on 8+9+10. Task 12 is last.
