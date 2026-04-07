# Local Phase Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all stub APIs with real Prisma-backed implementations for Tickets, Groups, Ticket Types, and Guard Portal — making the system 100% operational with persistence.

**Architecture:** Incremental backend-only changes on top of the existing labor-events branch. Add 7 Prisma models, replace 13 stub API routes with real queries, add seed data. Zero UI modifications.

**Tech Stack:** Prisma (PostgreSQL, multi-schema), Next.js App Router API routes, bcryptjs (portal auth), existing `@/lib/prisma` singleton, `requireAuth` + `ensureOpsAccess` auth guards.

---

## Task 0: Setup — Create worktree and merge base

**Files:**
- No file changes

**Step 1: Create isolated worktree from labor-events branch**

```bash
cd /Users/caco/Desktop/Cursor/opai
git fetch origin claude/labor-events-system-lzRyR
git worktree add .claude/worktrees/local-phase origin/claude/labor-events-system-lzRyR
cd .claude/worktrees/local-phase
```

**Step 2: Install dependencies**

```bash
npm install
```

**Step 3: Verify the branch builds cleanly**

```bash
npx prisma generate && npx next build
```

Expected: Build succeeds (stubs compile fine)

**Step 4: Verify DB connection**

```bash
npx prisma db pull --print 2>&1 | head -5
```

Expected: Shows current schema from DB (connection works)

---

## Task 1: Prisma Migration — Add 7 new models

**Files:**
- Modify: `prisma/schema.prisma` (add 7 models + relation fields on Admin, OpsGuardia)
- Create: `prisma/migrations/20260215000000_add_tickets_groups_system/migration.sql` (auto-generated)

**Step 1: Add relation fields to existing Admin model**

In `prisma/schema.prisma`, find `model Admin {` and add before the closing `}`:

```prisma
  groupMemberships AdminGroupMembership[]
```

**Step 2: Add relation field to existing OpsGuardia model**

Find `model OpsGuardia {` and add before the closing `}`:

```prisma
  tickets           OpsTicket[]
```

**Step 3: Add relation field to existing Tenant model**

Find `model Tenant {` and add before the closing `}`:

```prisma
  adminGroups       AdminGroup[]
```

**Step 4: Add AdminGroup model**

Add after the `RoleTemplate` model block (around line 195):

```prisma
model AdminGroup {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  slug        String
  name        String
  description String?
  color       String   @default("#6B7280")
  isSystem    Boolean  @default(false) @map("is_system")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  memberships AdminGroupMembership[]
  approvalSteps OpsTicketTypeApprovalStep[]

  @@unique([tenantId, slug], map: "uq_admin_groups_tenant_slug")
  @@index([tenantId], map: "idx_admin_groups_tenant")
  @@map("admin_groups")
  @@schema("public")
}

model AdminGroupMembership {
  id        String   @id @default(cuid())
  groupId   String   @map("group_id")
  adminId   String   @map("admin_id")
  role      String   @default("member")
  joinedAt  DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)

  group     AdminGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  admin     Admin      @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@unique([groupId, adminId], map: "uq_admin_group_memberships_group_admin")
  @@index([groupId], map: "idx_admin_group_memberships_group")
  @@index([adminId], map: "idx_admin_group_memberships_admin")
  @@map("admin_group_memberships")
  @@schema("public")
}
```

**Step 5: Add OpsTicketType models**

Add after the last ops model (before the finance schema section):

```prisma
model OpsTicketType {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @map("tenant_id")
  slug              String
  name              String
  description       String?
  origin            String   @default("internal")
  requiresApproval  Boolean  @default(false) @map("requires_approval")
  assignedTeam      String   @map("assigned_team")
  defaultPriority   String   @default("p3") @map("default_priority")
  slaHours          Int      @default(72) @map("sla_hours")
  icon              String?
  isActive          Boolean  @default(true) @map("is_active")
  sortOrder         Int      @default(0) @map("sort_order")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  approvalSteps     OpsTicketTypeApprovalStep[]
  tickets           OpsTicket[]

  @@unique([tenantId, slug], map: "uq_ops_ticket_types_tenant_slug")
  @@index([tenantId], map: "idx_ops_ticket_types_tenant")
  @@index([tenantId, isActive], map: "idx_ops_ticket_types_tenant_active")
  @@map("ops_ticket_types")
  @@schema("ops")
}

model OpsTicketTypeApprovalStep {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketTypeId    String   @map("ticket_type_id") @db.Uuid
  stepOrder       Int      @map("step_order")
  approverType    String   @default("group") @map("approver_type")
  approverGroupId String?  @map("approver_group_id")
  approverUserId  String?  @map("approver_user_id")
  label           String
  isRequired      Boolean  @default(true) @map("is_required")

  ticketType      OpsTicketType @relation(fields: [ticketTypeId], references: [id], onDelete: Cascade)
  approverGroup   AdminGroup?   @relation(fields: [approverGroupId], references: [id], onDelete: SetNull)

  @@index([ticketTypeId], map: "idx_ops_ticket_type_approval_steps_type")
  @@map("ops_ticket_type_approval_steps")
  @@schema("ops")
}
```

**Step 6: Add OpsTicket models**

```prisma
model OpsTicket {
  id                  String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId            String    @map("tenant_id")
  code                String
  ticketTypeId        String?   @map("ticket_type_id") @db.Uuid
  status              String    @default("open")
  priority            String    @default("p3")
  title               String
  description         String?
  assignedTeam        String    @map("assigned_team")
  assignedTo          String?   @map("assigned_to")
  installationId      String?   @map("installation_id") @db.Uuid
  source              String    @default("manual")
  sourceGuardEventId  String?   @map("source_guard_event_id")
  guardiaId           String?   @map("guardia_id") @db.Uuid
  reportedBy          String    @map("reported_by")
  slaDueAt            DateTime? @map("sla_due_at") @db.Timestamptz(6)
  slaBreached         Boolean   @default(false) @map("sla_breached")
  resolvedAt          DateTime? @map("resolved_at") @db.Timestamptz(6)
  closedAt            DateTime? @map("closed_at") @db.Timestamptz(6)
  resolutionNotes     String?   @map("resolution_notes")
  tags                String[]  @default([])
  currentApprovalStep Int?      @map("current_approval_step")
  approvalStatus      String?   @map("approval_status")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  ticketType          OpsTicketType? @relation(fields: [ticketTypeId], references: [id], onDelete: SetNull)
  guardia             OpsGuardia?    @relation(fields: [guardiaId], references: [id], onDelete: SetNull)
  approvals           OpsTicketApproval[]
  comments            OpsTicketComment[]

  @@unique([tenantId, code], map: "uq_ops_tickets_tenant_code")
  @@index([tenantId], map: "idx_ops_tickets_tenant")
  @@index([tenantId, status], map: "idx_ops_tickets_tenant_status")
  @@index([tenantId, assignedTeam], map: "idx_ops_tickets_tenant_team")
  @@index([guardiaId], map: "idx_ops_tickets_guardia")
  @@index([ticketTypeId], map: "idx_ops_tickets_type")
  @@map("ops_tickets")
  @@schema("ops")
}

model OpsTicketApproval {
  id              String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketId        String    @map("ticket_id") @db.Uuid
  stepOrder       Int       @map("step_order")
  stepLabel       String    @map("step_label")
  approverType    String    @map("approver_type")
  approverGroupId String?   @map("approver_group_id")
  approverUserId  String?   @map("approver_user_id")
  decision        String    @default("pending")
  decidedById     String?   @map("decided_by_id")
  comment         String?
  decidedAt       DateTime? @map("decided_at") @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  ticket          OpsTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId], map: "idx_ops_ticket_approvals_ticket")
  @@index([ticketId, stepOrder], map: "idx_ops_ticket_approvals_ticket_step")
  @@map("ops_ticket_approvals")
  @@schema("ops")
}

model OpsTicketComment {
  id         String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketId   String   @map("ticket_id") @db.Uuid
  userId     String   @map("user_id")
  body       String
  isInternal Boolean  @default(false) @map("is_internal")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  ticket     OpsTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId], map: "idx_ops_ticket_comments_ticket")
  @@map("ops_ticket_comments")
  @@schema("ops")
}
```

**Step 7: Generate and apply migration**

```bash
npx prisma migrate dev --name add_tickets_groups_system
```

Expected: Migration created and applied successfully. 7 new tables created.

**Step 8: Verify with prisma generate**

```bash
npx prisma generate
```

Expected: Client generated with new models available.

**Step 9: Quick sanity check — build**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build succeeds (stubs still work, they just don't use Prisma yet).

**Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(prisma): add AdminGroup, OpsTicketType, OpsTicket and related models"
```

---

## Task 2: Seed Script — Groups + Ticket Types

**Files:**
- Create: `prisma/seeds/ops-groups-ticket-types.ts`
- Modify: `prisma/seed.ts` (import and call new seeder)

**Step 1: Create the seed file**

Create `prisma/seeds/ops-groups-ticket-types.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS } from "../../src/lib/groups";
import { TICKET_TYPE_SEEDS } from "../../src/lib/tickets";

export async function seedGroupsAndTicketTypes(prisma: PrismaClient, tenantId: string) {
  console.log("🏷️  Seeding groups...");

  // Upsert each group seed
  const groupMap: Record<string, string> = {}; // slug → id
  for (const seed of GROUP_SEEDS) {
    const group = await prisma.adminGroup.upsert({
      where: {
        tenantId_slug: { tenantId, slug: seed.slug },
      },
      update: {
        name: seed.name,
        description: seed.description,
        color: seed.color,
        isSystem: seed.isSystem,
        isActive: seed.isActive,
      },
      create: {
        tenantId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description ?? null,
        color: seed.color,
        isSystem: seed.isSystem,
        isActive: seed.isActive,
      },
    });
    groupMap[seed.slug] = group.id;
    console.log(`  ✅ Group "${seed.name}" → ${group.id}`);
  }

  console.log("🎫 Seeding ticket types...");

  for (const seed of TICKET_TYPE_SEEDS) {
    // Upsert ticket type
    const ticketType = await prisma.opsTicketType.upsert({
      where: {
        tenantId_slug: { tenantId, slug: seed.slug },
      },
      update: {
        name: seed.name,
        description: seed.description,
        origin: seed.origin,
        requiresApproval: seed.requiresApproval,
        assignedTeam: seed.assignedTeam,
        defaultPriority: seed.defaultPriority,
        slaHours: seed.slaHours,
        icon: seed.icon,
        isActive: true,
      },
      create: {
        tenantId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        origin: seed.origin,
        requiresApproval: seed.requiresApproval,
        assignedTeam: seed.assignedTeam,
        defaultPriority: seed.defaultPriority,
        slaHours: seed.slaHours,
        icon: seed.icon,
        isActive: true,
        sortOrder: TICKET_TYPE_SEEDS.indexOf(seed) + 1,
      },
    });

    // Delete existing approval steps and recreate
    await prisma.opsTicketTypeApprovalStep.deleteMany({
      where: { ticketTypeId: ticketType.id },
    });

    for (let i = 0; i < seed.approvalChainGroupSlugs.length; i++) {
      const groupSlug = seed.approvalChainGroupSlugs[i];
      const groupId = groupMap[groupSlug];
      if (!groupId) {
        console.warn(`  ⚠️  Group slug "${groupSlug}" not found for ticket type "${seed.slug}"`);
        continue;
      }
      await prisma.opsTicketTypeApprovalStep.create({
        data: {
          ticketTypeId: ticketType.id,
          stepOrder: i + 1,
          approverType: "group",
          approverGroupId: groupId,
          label: `Aprobación ${seed.approvalChainGroupSlugs[i]}`,
          isRequired: true,
        },
      });
    }

    console.log(`  ✅ TicketType "${seed.name}" (${seed.approvalChainGroupSlugs.length} steps)`);
  }

  console.log(`✅ Seeded ${GROUP_SEEDS.length} groups, ${TICKET_TYPE_SEEDS.length} ticket types`);
}
```

**Step 2: Wire into main seed.ts**

In `prisma/seed.ts`, add import at top:

```typescript
import { seedGroupsAndTicketTypes } from './seeds/ops-groups-ticket-types';
```

Then add call after existing seeds (before the final `main().then...`):

```typescript
  // Groups + Ticket Types
  await seedGroupsAndTicketTypes(prisma, tenant.id);
```

**Step 3: Run seed**

```bash
npx prisma db seed
```

Expected: Groups and ticket types seeded successfully.

**Step 4: Verify data exists**

```bash
npx prisma studio
```

Check AdminGroup (6 rows), OpsTicketType (16 rows), OpsTicketTypeApprovalStep (populated for types with approval chains).

**Step 5: Commit**

```bash
git add prisma/seeds/ops-groups-ticket-types.ts prisma/seed.ts
git commit -m "feat(seed): add groups and ticket types seed data"
```

---

## Task 3: Groups API — Replace stubs with Prisma

**Files:**
- Modify: `src/app/api/ops/groups/route.ts`
- Modify: `src/app/api/ops/groups/[id]/route.ts`
- Modify: `src/app/api/ops/groups/[id]/members/route.ts`

**Step 1: Replace `src/app/api/ops/groups/route.ts`**

Full replacement — GET lists groups by tenant, POST creates a new group:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroup } from "@/lib/groups";
import { slugify } from "@/lib/groups";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const groups = await prisma.adminGroup.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });

    const data: AdminGroup[] = groups.map((g) => ({
      id: g.id,
      tenantId: g.tenantId,
      slug: g.slug,
      name: g.name,
      description: g.description,
      color: g.color,
      isSystem: g.isSystem,
      isActive: g.isActive,
      membersCount: g._count.memberships,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error listing groups:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los grupos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { name, description, color, slug: rawSlug } = body as {
      name?: string;
      description?: string;
      color?: string;
      slug?: string;
    };

    if (!name) {
      return NextResponse.json(
        { success: false, error: "name es requerido" },
        { status: 400 },
      );
    }

    const slug = rawSlug ?? slugify(name);

    // Check unique slug
    const existing = await prisma.adminGroup.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Ya existe un grupo con slug "${slug}"` },
        { status: 409 },
      );
    }

    const group = await prisma.adminGroup.create({
      data: {
        tenantId: ctx.tenantId,
        slug,
        name,
        description: description ?? null,
        color: color ?? "#6B7280",
        isSystem: false,
        isActive: true,
      },
      include: { _count: { select: { memberships: true } } },
    });

    const data: AdminGroup = {
      id: group.id,
      tenantId: group.tenantId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      isSystem: group.isSystem,
      isActive: group.isActive,
      membersCount: group._count.memberships,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[GROUPS] Error creating group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el grupo" },
      { status: 500 },
    );
  }
}
```

**Step 2: Replace `src/app/api/ops/groups/[id]/route.ts`**

Full replacement — GET detail, PATCH update, DELETE:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroup } from "@/lib/groups";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const group = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const data: AdminGroup = {
      id: group.id,
      tenantId: group.tenantId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      isSystem: group.isSystem,
      isActive: group.isActive,
      membersCount: group._count.memberships,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error fetching group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el grupo" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    const group = await prisma.adminGroup.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description !== undefined ? body.description : undefined,
        color: body.color ?? undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
      include: { _count: { select: { memberships: true } } },
    });

    const data: AdminGroup = {
      id: group.id,
      tenantId: group.tenantId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      isSystem: group.isSystem,
      isActive: group.isActive,
      membersCount: group._count.memberships,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error updating group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el grupo" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.adminGroup.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    if (existing.isSystem) {
      // Soft delete system groups
      await prisma.adminGroup.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      await prisma.adminGroup.delete({ where: { id } });
    }

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error("[GROUPS] Error deleting group:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el grupo" },
      { status: 500 },
    );
  }
}
```

**Step 3: Replace `src/app/api/ops/groups/[id]/members/route.ts`**

Full replacement:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { AdminGroupMembership, GroupMemberRole } from "@/lib/groups";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: groupId } = await params;

    const memberships = await prisma.adminGroupMembership.findMany({
      where: { groupId },
      include: {
        admin: { select: { id: true, name: true, email: true, role: true } },
        group: { select: { name: true, slug: true } },
      },
      orderBy: { joinedAt: "desc" },
    });

    const data: AdminGroupMembership[] = memberships.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      adminId: m.adminId,
      role: m.role as GroupMemberRole,
      joinedAt: m.joinedAt.toISOString(),
      adminName: m.admin.name,
      adminEmail: m.admin.email,
      adminRole: m.admin.role,
      groupName: m.group.name,
      groupSlug: m.group.slug,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GROUPS] Error listing members:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los miembros" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: groupId } = await params;
    const body = await request.json();
    const { adminId, role } = body as { adminId?: string; role?: GroupMemberRole };

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: "adminId es requerido" },
        { status: 400 },
      );
    }

    // Check group exists and belongs to tenant
    const group = await prisma.adminGroup.findFirst({
      where: { id: groupId, tenantId: ctx.tenantId },
    });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Grupo no encontrado" },
        { status: 404 },
      );
    }

    // Check admin exists
    const admin = await prisma.admin.findFirst({
      where: { id: adminId, tenantId: ctx.tenantId },
    });
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    // Upsert membership (idempotent)
    const membership = await prisma.adminGroupMembership.upsert({
      where: {
        groupId_adminId: { groupId, adminId },
      },
      update: { role: role ?? "member" },
      create: {
        groupId,
        adminId,
        role: role ?? "member",
      },
      include: {
        admin: { select: { id: true, name: true, email: true, role: true } },
        group: { select: { name: true, slug: true } },
      },
    });

    const data: AdminGroupMembership = {
      id: membership.id,
      groupId: membership.groupId,
      adminId: membership.adminId,
      role: membership.role as GroupMemberRole,
      joinedAt: membership.joinedAt.toISOString(),
      adminName: membership.admin.name,
      adminEmail: membership.admin.email,
      adminRole: membership.admin.role,
      groupName: membership.group.name,
      groupSlug: membership.group.slug,
    };

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[GROUPS] Error adding member:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo agregar el miembro al grupo" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: groupId } = await params;
    const body = await request.json();
    const { adminId } = body as { adminId?: string };

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: "adminId es requerido" },
        { status: 400 },
      );
    }

    await prisma.adminGroupMembership.deleteMany({
      where: { groupId, adminId },
    });

    return NextResponse.json({
      success: true,
      data: { groupId, adminId, removed: true },
    });
  } catch (error) {
    console.error("[GROUPS] Error removing member:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo remover el miembro del grupo" },
      { status: 500 },
    );
  }
}
```

**Step 4: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/api/ops/groups/
git commit -m "feat(api): replace groups stub APIs with Prisma queries"
```

---

## Task 4: Ticket Types API — Replace stubs with Prisma

**Files:**
- Modify: `src/app/api/ops/ticket-types/route.ts`
- Modify: `src/app/api/ops/ticket-types/[id]/route.ts`
- Modify: `src/app/api/ops/ticket-categories/route.ts` (if exists, for backward compat)

**Step 1: Replace `src/app/api/ops/ticket-types/route.ts`**

GET lists types with populated approval steps, POST creates with nested steps:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketType, TicketTypeApprovalStep } from "@/lib/tickets";

function mapApprovalStep(step: any): TicketTypeApprovalStep {
  return {
    id: step.id,
    ticketTypeId: step.ticketTypeId,
    stepOrder: step.stepOrder,
    approverType: step.approverType,
    approverGroupId: step.approverGroupId,
    approverUserId: step.approverUserId,
    label: step.label,
    isRequired: step.isRequired,
    approverGroupName: step.approverGroup?.name ?? null,
  };
}

function mapTicketType(tt: any): TicketType {
  return {
    id: tt.id,
    tenantId: tt.tenantId,
    slug: tt.slug,
    name: tt.name,
    description: tt.description,
    origin: tt.origin,
    requiresApproval: tt.requiresApproval,
    assignedTeam: tt.assignedTeam,
    defaultPriority: tt.defaultPriority,
    slaHours: tt.slaHours,
    icon: tt.icon,
    isActive: tt.isActive,
    sortOrder: tt.sortOrder,
    approvalSteps: (tt.approvalSteps ?? []).map(mapApprovalStep),
    createdAt: tt.createdAt instanceof Date ? tt.createdAt.toISOString() : tt.createdAt,
    updatedAt: tt.updatedAt instanceof Date ? tt.updatedAt.toISOString() : tt.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const types = await prisma.opsTicketType.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        approvalSteps: {
          include: { approverGroup: { select: { name: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const items: TicketType[] = types.map(mapTicketType);

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket types:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tipos de ticket" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    if (!body.slug || !body.name || !body.assignedTeam) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: slug, name, assignedTeam" },
        { status: 400 },
      );
    }

    // Check unique slug
    const existing = await prisma.opsTicketType.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug: body.slug } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Ya existe un tipo con slug "${body.slug}"` },
        { status: 409 },
      );
    }

    // Build approval steps data
    const stepsData = (body.approvalSteps ?? []).map((step: any, i: number) => ({
      stepOrder: i + 1,
      approverType: step.approverType ?? "group",
      approverGroupId: step.approverGroupId ?? null,
      approverUserId: step.approverUserId ?? null,
      label: step.label ?? `Paso ${i + 1}`,
      isRequired: step.isRequired !== false,
    }));

    const maxSort = await prisma.opsTicketType.aggregate({
      where: { tenantId: ctx.tenantId },
      _max: { sortOrder: true },
    });

    const ticketType = await prisma.opsTicketType.create({
      data: {
        tenantId: ctx.tenantId,
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        origin: body.origin ?? "internal",
        requiresApproval: body.requiresApproval ?? stepsData.length > 0,
        assignedTeam: body.assignedTeam,
        defaultPriority: body.defaultPriority ?? "p3",
        slaHours: body.slaHours ?? 72,
        icon: body.icon ?? null,
        isActive: true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        approvalSteps: { create: stepsData },
      },
      include: {
        approvalSteps: {
          include: { approverGroup: { select: { name: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: mapTicketType(ticketType) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el tipo de ticket" },
      { status: 500 },
    );
  }
}
```

**Step 2: Replace `src/app/api/ops/ticket-types/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketType, TicketTypeApprovalStep } from "@/lib/tickets";

function mapApprovalStep(step: any): TicketTypeApprovalStep {
  return {
    id: step.id,
    ticketTypeId: step.ticketTypeId,
    stepOrder: step.stepOrder,
    approverType: step.approverType,
    approverGroupId: step.approverGroupId,
    approverUserId: step.approverUserId,
    label: step.label,
    isRequired: step.isRequired,
    approverGroupName: step.approverGroup?.name ?? null,
  };
}

function mapTicketType(tt: any): TicketType {
  return {
    id: tt.id,
    tenantId: tt.tenantId,
    slug: tt.slug,
    name: tt.name,
    description: tt.description,
    origin: tt.origin,
    requiresApproval: tt.requiresApproval,
    assignedTeam: tt.assignedTeam,
    defaultPriority: tt.defaultPriority,
    slaHours: tt.slaHours,
    icon: tt.icon,
    isActive: tt.isActive,
    sortOrder: tt.sortOrder,
    approvalSteps: (tt.approvalSteps ?? []).map(mapApprovalStep),
    createdAt: tt.createdAt instanceof Date ? tt.createdAt.toISOString() : tt.createdAt,
    updatedAt: tt.updatedAt instanceof Date ? tt.updatedAt.toISOString() : tt.updatedAt,
  };
}

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const tt = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        approvalSteps: {
          include: { approverGroup: { select: { name: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    if (!tt) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: mapTicketType(tt) });
  } catch (error) {
    console.error("[OPS] Error fetching ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el tipo de ticket" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    // If approvalSteps provided, replace them
    if (body.approvalSteps !== undefined) {
      await prisma.opsTicketTypeApprovalStep.deleteMany({
        where: { ticketTypeId: id },
      });

      if (Array.isArray(body.approvalSteps) && body.approvalSteps.length > 0) {
        await prisma.opsTicketTypeApprovalStep.createMany({
          data: body.approvalSteps.map((step: any, i: number) => ({
            ticketTypeId: id,
            stepOrder: i + 1,
            approverType: step.approverType ?? "group",
            approverGroupId: step.approverGroupId ?? null,
            approverUserId: step.approverUserId ?? null,
            label: step.label ?? `Paso ${i + 1}`,
            isRequired: step.isRequired !== false,
          })),
        });
      }
    }

    const tt = await prisma.opsTicketType.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description !== undefined ? body.description : undefined,
        origin: body.origin ?? undefined,
        requiresApproval: body.requiresApproval ?? undefined,
        assignedTeam: body.assignedTeam ?? undefined,
        defaultPriority: body.defaultPriority ?? undefined,
        slaHours: body.slaHours ?? undefined,
        icon: body.icon !== undefined ? body.icon : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
      include: {
        approvalSteps: {
          include: { approverGroup: { select: { name: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    return NextResponse.json({ success: true, data: mapTicketType(tt) });
  } catch (error) {
    console.error("[OPS] Error updating ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el tipo de ticket" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    // Soft delete (deactivate) — types may be referenced by existing tickets
    await prisma.opsTicketType.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error("[OPS] Error deleting ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el tipo de ticket" },
      { status: 500 },
    );
  }
}
```

**Step 3: Build check**

```bash
npx next build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/app/api/ops/ticket-types/
git commit -m "feat(api): replace ticket types stub APIs with Prisma queries"
```

---

## Task 5: Tickets API — Replace stubs with Prisma

**Files:**
- Modify: `src/app/api/ops/tickets/route.ts`
- Modify: `src/app/api/ops/tickets/[id]/route.ts`
- Modify: `src/app/api/ops/tickets/[id]/transition/route.ts`
- Modify: `src/app/api/ops/tickets/[id]/approvals/route.ts`
- Modify: `src/app/api/ops/tickets/[id]/comments/route.ts`

**Step 1: Replace `src/app/api/ops/tickets/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { generateTicketCode } from "@/lib/tickets";
import type { Ticket } from "@/lib/tickets";

const ticketIncludes = {
  ticketType: { select: { id: true, name: true, slug: true, origin: true } },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { approvals: true, comments: true } },
};

function mapTicket(t: any): Ticket {
  return {
    id: t.id,
    tenantId: t.tenantId,
    code: t.code,
    ticketTypeId: t.ticketTypeId,
    ticketType: t.ticketType ?? null,
    categoryId: t.ticketTypeId ?? "", // backward compat
    status: t.status,
    priority: t.priority,
    title: t.title,
    description: t.description,
    assignedTeam: t.assignedTeam,
    assignedTo: t.assignedTo,
    installationId: t.installationId,
    source: t.source,
    sourceLogId: null,
    sourceGuardEventId: t.sourceGuardEventId,
    guardiaId: t.guardiaId,
    guardiaName: t.guardia
      ? `${t.guardia.persona.firstName} ${t.guardia.persona.lastName}`
      : null,
    reportedBy: t.reportedBy,
    slaDueAt: t.slaDueAt?.toISOString() ?? null,
    slaBreached: t.slaBreached,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    resolutionNotes: t.resolutionNotes,
    tags: t.tags,
    currentApprovalStep: t.currentApprovalStep,
    approvalStatus: t.approvalStatus,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    commentsCount: t._count?.comments ?? 0,
    attachmentsCount: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignedTeam = searchParams.get("assignedTeam");
    const ticketTypeId = searchParams.get("ticketTypeId");
    const guardiaId = searchParams.get("guardiaId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const where: any = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTeam) where.assignedTeam = assignedTeam;
    if (ticketTypeId) where.ticketTypeId = ticketTypeId;
    if (guardiaId) where.guardiaId = guardiaId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.opsTicket.findMany({
        where,
        include: ticketIncludes,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.opsTicket.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { items: items.map(mapTicket), total, page, limit },
    });
  } catch (error) {
    console.error("[OPS] Error listing tickets:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tickets" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { success: false, error: "title es requerido" },
        { status: 400 },
      );
    }

    // Generate sequential code
    const count = await prisma.opsTicket.count({
      where: { tenantId: ctx.tenantId },
    });
    const code = generateTicketCode(count + 1);

    // Load ticket type for defaults
    let ticketType = null;
    if (body.ticketTypeId) {
      ticketType = await prisma.opsTicketType.findFirst({
        where: { id: body.ticketTypeId, tenantId: ctx.tenantId },
        include: {
          approvalSteps: { orderBy: { stepOrder: "asc" } },
        },
      });
    }

    // Calculate SLA
    const slaHours = ticketType?.slaHours ?? 72;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // Determine initial status and approval state
    const needsApproval = ticketType?.requiresApproval && (ticketType.approvalSteps?.length ?? 0) > 0;
    const initialStatus = needsApproval ? "pending_approval" : "open";

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        ticketTypeId: body.ticketTypeId ?? null,
        status: initialStatus,
        priority: body.priority ?? ticketType?.defaultPriority ?? "p3",
        title: body.title,
        description: body.description ?? null,
        assignedTeam: body.assignedTeam ?? ticketType?.assignedTeam ?? "ops",
        assignedTo: body.assignedTo ?? null,
        installationId: body.installationId ?? null,
        source: body.source ?? "manual",
        sourceGuardEventId: body.sourceGuardEventId ?? null,
        guardiaId: body.guardiaId ?? null,
        reportedBy: ctx.userId,
        slaDueAt,
        currentApprovalStep: needsApproval ? 1 : null,
        approvalStatus: needsApproval ? "pending" : null,
        tags: body.tags ?? [],
      },
      include: ticketIncludes,
    });

    // Create approval records if needed
    if (needsApproval && ticketType?.approvalSteps) {
      await prisma.opsTicketApproval.createMany({
        data: ticketType.approvalSteps.map((step) => ({
          ticketId: ticket.id,
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          approverType: step.approverType,
          approverGroupId: step.approverGroupId,
          approverUserId: step.approverUserId,
          decision: "pending",
        })),
      });
    }

    return NextResponse.json(
      { success: true, data: mapTicket(ticket) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el ticket" },
      { status: 500 },
    );
  }
}
```

**Step 2: Replace `src/app/api/ops/tickets/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { Ticket } from "@/lib/tickets";

const ticketDetailIncludes = {
  ticketType: {
    select: { id: true, name: true, slug: true, origin: true, slaHours: true },
  },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  },
  approvals: { orderBy: { stepOrder: "asc" as const } },
  comments: { orderBy: { createdAt: "desc" as const } },
  _count: { select: { approvals: true, comments: true } },
};

function mapTicketDetail(t: any): Ticket {
  return {
    id: t.id,
    tenantId: t.tenantId,
    code: t.code,
    ticketTypeId: t.ticketTypeId,
    ticketType: t.ticketType ?? null,
    categoryId: t.ticketTypeId ?? "",
    status: t.status,
    priority: t.priority,
    title: t.title,
    description: t.description,
    assignedTeam: t.assignedTeam,
    assignedTo: t.assignedTo,
    installationId: t.installationId,
    source: t.source,
    sourceLogId: null,
    sourceGuardEventId: t.sourceGuardEventId,
    guardiaId: t.guardiaId,
    guardiaName: t.guardia
      ? `${t.guardia.persona.firstName} ${t.guardia.persona.lastName}`
      : null,
    reportedBy: t.reportedBy,
    slaDueAt: t.slaDueAt?.toISOString() ?? null,
    slaBreached: t.slaBreached,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    resolutionNotes: t.resolutionNotes,
    tags: t.tags,
    currentApprovalStep: t.currentApprovalStep,
    approvalStatus: t.approvalStatus,
    approvals: (t.approvals ?? []).map((a: any) => ({
      ...a,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    commentsCount: t._count?.comments ?? 0,
    attachmentsCount: 0,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: ticketDetailIncludes,
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: mapTicketDetail(ticket) });
  } catch (error) {
    console.error("[OPS] Error fetching ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el ticket" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const ticket = await prisma.opsTicket.update({
      where: { id },
      data: {
        title: body.title ?? undefined,
        description: body.description !== undefined ? body.description : undefined,
        priority: body.priority ?? undefined,
        assignedTeam: body.assignedTeam ?? undefined,
        assignedTo: body.assignedTo !== undefined ? body.assignedTo : undefined,
        tags: body.tags ?? undefined,
        resolutionNotes: body.resolutionNotes !== undefined ? body.resolutionNotes : undefined,
      },
      include: ticketDetailIncludes,
    });

    return NextResponse.json({ success: true, data: mapTicketDetail(ticket) });
  } catch (error) {
    console.error("[OPS] Error updating ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el ticket" },
      { status: 500 },
    );
  }
}
```

**Step 3: Replace `src/app/api/ops/tickets/[id]/transition/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canTransitionTo, type TicketStatus } from "@/lib/tickets";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: "status es requerido" },
        { status: 400 },
      );
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const target = body.status as TicketStatus;
    if (!canTransitionTo(ticket.status as TicketStatus, target)) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede cambiar de "${ticket.status}" a "${target}"`,
        },
        { status: 422 },
      );
    }

    const now = new Date();
    const updateData: any = { status: target };

    if (target === "resolved") {
      updateData.resolvedAt = now;
      updateData.resolutionNotes = body.resolutionNotes ?? null;
    }
    if (target === "closed") {
      updateData.closedAt = now;
    }

    const updated = await prisma.opsTicket.update({
      where: { id },
      data: updateData,
      include: {
        ticketType: { select: { id: true, name: true, slug: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS] Error transitioning ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cambiar el estado del ticket" },
      { status: 500 },
    );
  }
}
```

**Step 4: Replace `src/app/api/ops/tickets/[id]/approvals/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const approvals = await prisma.opsTicketApproval.findMany({
      where: { ticketId },
      orderBy: { stepOrder: "asc" },
    });

    const items = approvals.map((a) => ({
      ...a,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket approvals:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener las aprobaciones" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const body = await request.json();

    if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
      return NextResponse.json(
        { success: false, error: "decision es requerido ('approved' | 'rejected')" },
        { status: 400 },
      );
    }

    // Load ticket
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    if (ticket.status !== "pending_approval" || ticket.currentApprovalStep === null) {
      return NextResponse.json(
        { success: false, error: "El ticket no está pendiente de aprobación" },
        { status: 422 },
      );
    }

    // Find current pending approval step
    const currentApproval = await prisma.opsTicketApproval.findFirst({
      where: {
        ticketId,
        stepOrder: ticket.currentApprovalStep,
        decision: "pending",
      },
    });

    if (!currentApproval) {
      return NextResponse.json(
        { success: false, error: "No se encontró el paso de aprobación actual" },
        { status: 422 },
      );
    }

    // TODO: Validate that the user belongs to the approver group
    // For now, any authenticated user can approve

    const now = new Date();

    // Update approval record
    await prisma.opsTicketApproval.update({
      where: { id: currentApproval.id },
      data: {
        decision: body.decision,
        decidedById: ctx.userId,
        comment: body.comment ?? null,
        decidedAt: now,
      },
    });

    // Handle decision
    if (body.decision === "rejected") {
      // Rejected: set ticket to rejected
      await prisma.opsTicket.update({
        where: { id: ticketId },
        data: {
          status: "rejected",
          approvalStatus: "rejected",
        },
      });
    } else {
      // Approved: check if there's a next step
      const nextStep = await prisma.opsTicketApproval.findFirst({
        where: {
          ticketId,
          stepOrder: ticket.currentApprovalStep + 1,
          decision: "pending",
        },
      });

      if (nextStep) {
        // Advance to next step
        await prisma.opsTicket.update({
          where: { id: ticketId },
          data: {
            currentApprovalStep: nextStep.stepOrder,
          },
        });
      } else {
        // All steps approved — ticket is now open
        await prisma.opsTicket.update({
          where: { id: ticketId },
          data: {
            status: "open",
            approvalStatus: "approved",
            currentApprovalStep: null,
          },
        });
      }
    }

    // Return updated ticket
    const updatedTicket = await prisma.opsTicket.findUnique({
      where: { id: ticketId },
      include: {
        approvals: { orderBy: { stepOrder: "asc" } },
      },
    });

    return NextResponse.json({ success: true, data: updatedTicket });
  } catch (error) {
    console.error("[OPS] Error processing approval:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo procesar la aprobación" },
      { status: 500 },
    );
  }
}
```

**Step 5: Replace `src/app/api/ops/tickets/[id]/comments/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const comments = await prisma.opsTicketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
    });

    const items = comments.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      userId: c.userId,
      body: c.body,
      isInternal: c.isInternal,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing comments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los comentarios" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const body = await request.json();

    if (!body.body) {
      return NextResponse.json(
        { success: false, error: "body es requerido" },
        { status: 400 },
      );
    }

    // Verify ticket exists
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const comment = await prisma.opsTicketComment.create({
      data: {
        ticketId,
        userId: ctx.userId,
        body: body.body,
        isInternal: body.isInternal ?? false,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: comment.id,
          ticketId: comment.ticketId,
          userId: comment.userId,
          userName: ctx.userEmail,
          body: comment.body,
          isInternal: comment.isInternal,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error adding comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo agregar el comentario" },
      { status: 500 },
    );
  }
}
```

**Step 6: Build check**

```bash
npx next build 2>&1 | tail -20
```

**Step 7: Commit**

```bash
git add src/app/api/ops/tickets/
git commit -m "feat(api): replace tickets stub APIs with Prisma queries (CRUD, transitions, approvals, comments)"
```

---

## Task 6: Portal Guardia API — Replace stubs with Prisma

**Files:**
- Modify: `src/app/api/portal/guardia/auth/route.ts`
- Modify: `src/app/api/portal/guardia/schedule/route.ts`
- Modify: `src/app/api/portal/guardia/tickets/route.ts`
- Modify: `src/app/api/portal/guardia/profile/route.ts`
- Modify: `src/app/api/portal/guardia/marcaciones/route.ts`
- Modify: `src/app/api/portal/guardia/documents/route.ts`
- Modify: `src/app/api/portal/guardia/attendance/route.ts`
- Modify: `src/app/api/portal/guardia/extra-shifts/route.ts`

**Step 1: Replace auth route** (`src/app/api/portal/guardia/auth/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import type { GuardSession } from "@/lib/guard-portal";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as { rut?: string; pin?: string };

    if (!rut || !pin) {
      return NextResponse.json(
        { success: false, error: "RUT y PIN son requeridos" },
        { status: 401 },
      );
    }

    // Clean RUT for lookup
    const cleanRut = rut.replace(/[.\-]/g, "").toUpperCase();

    // Find persona by RUT
    const persona = await prisma.opsPersona.findFirst({
      where: {
        OR: [
          { rut: cleanRut },
          { rut: rut },
          { rut: { contains: cleanRut.replace(/[kK]$/, "") } },
        ],
      },
      include: {
        guardia: {
          include: {
            currentInstallation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!persona?.guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 401 },
      );
    }

    const guardia = persona.guardia;

    // Validate PIN
    if (!guardia.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado para este guardia" },
        { status: 401 },
      );
    }

    // Check if stored PIN is bcrypt hash or plain
    let pinValid = false;
    if (guardia.marcacionPin.startsWith("$2")) {
      pinValid = await bcrypt.compare(pin, guardia.marcacionPin);
    } else {
      // Plain text comparison (legacy) or visible PIN
      pinValid = guardia.marcacionPin === pin || guardia.marcacionPinVisible === pin;
    }

    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "PIN incorrecto" },
        { status: 401 },
      );
    }

    const session: GuardSession = {
      guardiaId: guardia.id,
      personaId: persona.id,
      tenantId: guardia.tenantId,
      firstName: persona.firstName,
      lastName: persona.lastName,
      rut: persona.rut ?? rut,
      code: guardia.code,
      currentInstallationId: guardia.currentInstallationId,
      currentInstallationName: guardia.currentInstallation?.name ?? null,
      authenticatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[PORTAL] Auth error:", error);
    return NextResponse.json(
      { success: false, error: "Error de autenticación" },
      { status: 500 },
    );
  }
}
```

**Step 2: Replace schedule route** — query from OpsPautaMensual + OpsAsistenciaDiaria

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardScheduleDay } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const month = searchParams.get("month");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: "month es requerido (formato YYYY-MM)" },
        { status: 400 },
      );
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    // Find pauta for this guard and month
    const pauta = await prisma.opsPautaMensual.findFirst({
      where: {
        guardiaId,
        year,
        month: monthNum,
      },
      include: {
        asistencias: {
          include: {
            installation: { select: { name: true } },
          },
          orderBy: { date: "asc" },
        },
      },
    });

    if (!pauta) {
      return NextResponse.json({ success: true, data: [] });
    }

    const SHIFT_LABELS: Record<string, string> = {
      T: "Trabajo",
      "-": "Descanso",
      V: "Vacaciones",
      L: "Licencia",
      P: "Permiso",
      F: "Feriado",
    };

    const data: GuardScheduleDay[] = pauta.asistencias.map((a) => ({
      date: a.date.toISOString().split("T")[0],
      shiftCode: a.shiftCode ?? "T",
      shiftLabel: SHIFT_LABELS[a.shiftCode ?? "T"] ?? a.shiftCode ?? "Trabajo",
      installationName: a.installation?.name ?? null,
      turno: a.turnoEntrada && a.turnoSalida
        ? `${a.turnoEntrada}-${a.turnoSalida}`
        : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PORTAL] Schedule error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la pauta" },
      { status: 500 },
    );
  }
}
```

**Step 3: Replace tickets route** — guard's own tickets

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTicketCode } from "@/lib/tickets";
import type { GuardTicket } from "@/lib/guard-portal";
import { TICKET_STATUS_CONFIG } from "@/lib/tickets";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const tickets = await prisma.opsTicket.findMany({
      where: { guardiaId },
      include: {
        ticketType: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const data: GuardTicket[] = tickets.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      typeName: t.ticketType?.name ?? "General",
      status: t.status,
      statusLabel: TICKET_STATUS_CONFIG[t.status as keyof typeof TICKET_STATUS_CONFIG]?.label ?? t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PORTAL] Tickets error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tickets" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guardiaId, ticketTypeId, title, description, tenantId } = body as {
      guardiaId?: string;
      ticketTypeId?: string;
      title?: string;
      description?: string;
      tenantId?: string;
    };

    if (!guardiaId || !title || !tenantId) {
      return NextResponse.json(
        { success: false, error: "guardiaId, title y tenantId son requeridos" },
        { status: 400 },
      );
    }

    // Generate code
    const count = await prisma.opsTicket.count({ where: { tenantId } });
    const code = generateTicketCode(count + 1);

    // Load ticket type for defaults
    let ticketType = null;
    if (ticketTypeId) {
      ticketType = await prisma.opsTicketType.findUnique({
        where: { id: ticketTypeId },
        include: { approvalSteps: { orderBy: { stepOrder: "asc" } } },
      });
    }

    const needsApproval = ticketType?.requiresApproval && (ticketType.approvalSteps?.length ?? 0) > 0;
    const slaHours = ticketType?.slaHours ?? 72;

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId,
        code,
        ticketTypeId: ticketTypeId ?? null,
        status: needsApproval ? "pending_approval" : "open",
        priority: ticketType?.defaultPriority ?? "p3",
        title,
        description: description ?? null,
        assignedTeam: ticketType?.assignedTeam ?? "rrhh",
        source: "portal",
        guardiaId,
        reportedBy: guardiaId,
        slaDueAt: new Date(Date.now() + slaHours * 60 * 60 * 1000),
        currentApprovalStep: needsApproval ? 1 : null,
        approvalStatus: needsApproval ? "pending" : null,
      },
    });

    // Create approval records if needed
    if (needsApproval && ticketType?.approvalSteps) {
      await prisma.opsTicketApproval.createMany({
        data: ticketType.approvalSteps.map((step) => ({
          ticketId: ticket.id,
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          approverType: step.approverType,
          approverGroupId: step.approverGroupId,
          approverUserId: step.approverUserId,
          decision: "pending",
        })),
      });
    }

    return NextResponse.json(
      { success: true, data: { id: ticket.id, code: ticket.code } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[PORTAL] Create ticket error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la solicitud" },
      { status: 500 },
    );
  }
}
```

**Step 4: Replace profile route** — real guard data

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      include: {
        persona: {
          select: {
            firstName: true,
            lastName: true,
            rut: true,
            email: true,
            phone: true,
            birthDate: true,
          },
        },
        currentInstallation: { select: { name: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: guardia.id,
        firstName: guardia.persona.firstName,
        lastName: guardia.persona.lastName,
        rut: guardia.persona.rut,
        email: guardia.persona.email,
        phone: guardia.persona.phone,
        code: guardia.code,
        status: guardia.status,
        currentInstallation: guardia.currentInstallation?.name ?? null,
        hiredAt: guardia.hiredAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[PORTAL] Profile error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el perfil" },
      { status: 500 },
    );
  }
}
```

**Step 5: Replace marcaciones route** — real data from OpsMarcacion

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardMarcacion } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: { guardiaId },
      include: {
        installation: { select: { name: true } },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const data: GuardMarcacion[] = marcaciones.map((m) => ({
      id: m.id,
      type: m.type as "entrada" | "salida",
      timestamp: m.timestamp.toISOString(),
      installationName: m.installation?.name ?? "Sin instalación",
      geoValidated: m.geoValidated ?? false,
      geoDistanceM: m.geoDistanceM ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PORTAL] Marcaciones error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener las marcaciones" },
      { status: 500 },
    );
  }
}
```

**Step 6: Replace documents route** — real data from OpsDocumentoPersona

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardDocument } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const documents = await prisma.opsDocumentoPersona.findMany({
      where: { guardiaId },
      orderBy: { createdAt: "desc" },
    });

    const data: GuardDocument[] = documents.map((d) => ({
      id: d.id,
      title: d.title ?? d.type,
      type: d.type,
      createdAt: d.createdAt.toISOString(),
      url: d.publicUrl ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PORTAL] Documents error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los documentos" },
      { status: 500 },
    );
  }
}
```

**Step 7: Replace attendance and extra-shifts routes** — these query OpsAsistenciaDiaria and OpsTurnoExtra respectively. Follow the same pattern as above using real Prisma queries.

**Step 8: Build check**

```bash
npx next build 2>&1 | tail -20
```

**Step 9: Commit**

```bash
git add src/app/api/portal/
git commit -m "feat(api): replace portal guardia stub APIs with Prisma queries"
```

---

## Task 7: Final Verification — Full build + smoke test

**Step 1: Full build**

```bash
npx prisma generate && npx next build
```

Expected: Clean build with zero errors.

**Step 2: Start dev server and smoke test**

```bash
npm run dev
```

Test each endpoint:
- `GET /api/ops/groups` → should return 6 seeded groups
- `GET /api/ops/ticket-types` → should return 16 seeded types
- `GET /api/ops/tickets` → should return empty list (no tickets created yet)
- Visit `/opai/configuracion/grupos` → should show real groups from DB
- Visit `/opai/configuracion/tipos-ticket` → should show real types from DB
- Visit `/ops/tickets` → should show empty list, create button works

**Step 3: Test create flow**
- Create a ticket via the UI
- Verify it appears in the list
- Verify detail page loads with approval timeline

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete local phase — all stub APIs replaced with Prisma queries"
```
