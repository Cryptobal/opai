# Local Phase Backend Design — Tickets, Groups & Guard Portal

**Date:** 2026-02-15
**Status:** Approved
**Branch:** `claude/labor-events-system-lzRyR` (8 commits ahead of main)

## Context

The cloud/stub phase is complete on the labor-events branch with full UI, types, helpers, and 13 stub API routes. This design covers replacing all stubs with real Prisma-backed implementations.

**Constraints:**
- Zero UI changes — components already consume the APIs correctly
- Multi-tenant — every model includes `tenantId`
- Conventions: UUID for ops schema, cuid for public schema, snake_case DB columns, string status fields (no enums)

## Section 1: Prisma Schema — 7 New Models

### Model Placement

| Model | Schema | ID Strategy | Reason |
|-------|--------|-------------|--------|
| `AdminGroup` | public | cuid | References Admin (public) |
| `AdminGroupMembership` | public | cuid | Junction for Admin + AdminGroup |
| `OpsTicketType` | ops | uuid | Ops domain |
| `OpsTicketTypeApprovalStep` | ops | uuid | Child of OpsTicketType |
| `OpsTicket` | ops | uuid | Ops domain |
| `OpsTicketApproval` | ops | uuid | Child of OpsTicket |
| `OpsTicketComment` | ops | uuid | Child of OpsTicket |

### AdminGroup

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

  @@unique([tenantId, slug])
  @@index([tenantId])
  @@map("admin_groups")
  @@schema("public")
}
```

### AdminGroupMembership

```prisma
model AdminGroupMembership {
  id        String   @id @default(cuid())
  groupId   String   @map("group_id")
  adminId   String   @map("admin_id")
  role      String   @default("member") // "member" | "lead"
  joinedAt  DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)

  group     AdminGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  admin     Admin      @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@unique([groupId, adminId])
  @@index([groupId])
  @@index([adminId])
  @@map("admin_group_memberships")
  @@schema("public")
}
```

### OpsTicketType

```prisma
model OpsTicketType {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @map("tenant_id")
  slug              String
  name              String
  description       String?
  origin            String   @default("internal") // "guard" | "internal" | "both"
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

  @@unique([tenantId, slug])
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@map("ops_ticket_types")
  @@schema("ops")
}
```

### OpsTicketTypeApprovalStep

```prisma
model OpsTicketTypeApprovalStep {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketTypeId    String   @map("ticket_type_id") @db.Uuid
  stepOrder       Int      @map("step_order")
  approverType    String   @default("group") @map("approver_type") // "group" | "user"
  approverGroupId String?  @map("approver_group_id")
  approverUserId  String?  @map("approver_user_id")
  label           String
  isRequired      Boolean  @default(true) @map("is_required")

  ticketType      OpsTicketType @relation(fields: [ticketTypeId], references: [id], onDelete: Cascade)
  approverGroup   AdminGroup?   @relation(fields: [approverGroupId], references: [id], onDelete: SetNull)

  @@index([ticketTypeId])
  @@map("ops_ticket_type_approval_steps")
  @@schema("ops")
}
```

### OpsTicket

```prisma
model OpsTicket {
  id                  String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId            String    @map("tenant_id")
  code                String    // "TK-202602-0001"
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

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, assignedTeam])
  @@index([guardiaId])
  @@index([ticketTypeId])
  @@map("ops_tickets")
  @@schema("ops")
}
```

### OpsTicketApproval

```prisma
model OpsTicketApproval {
  id              String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketId        String    @map("ticket_id") @db.Uuid
  stepOrder       Int       @map("step_order")
  stepLabel       String    @map("step_label")
  approverType    String    @map("approver_type")
  approverGroupId String?   @map("approver_group_id")
  approverUserId  String?   @map("approver_user_id")
  decision        String    @default("pending") // "pending" | "approved" | "rejected"
  decidedById     String?   @map("decided_by_id")
  comment         String?
  decidedAt       DateTime? @map("decided_at") @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  ticket          OpsTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@index([ticketId, stepOrder])
  @@map("ops_ticket_approvals")
  @@schema("ops")
}
```

### OpsTicketComment

```prisma
model OpsTicketComment {
  id         String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ticketId   String   @map("ticket_id") @db.Uuid
  userId     String   @map("user_id")
  body       String
  isInternal Boolean  @default(false) @map("is_internal")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  ticket     OpsTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("ops_ticket_comments")
  @@schema("ops")
}
```

## Section 2: API Implementation Order

### Phase A — Groups (no dependencies)
1. `GET /api/ops/groups` — list by tenant
2. `POST /api/ops/groups` — create
3. `GET /api/ops/groups/[id]` — detail with members count
4. `PUT /api/ops/groups/[id]` — update
5. `DELETE /api/ops/groups/[id]` — soft delete (isActive=false) for system, hard delete otherwise
6. `GET /api/ops/groups/[id]/members` — list memberships
7. `POST /api/ops/groups/[id]/members` — add member
8. `DELETE /api/ops/groups/[id]/members` — remove member

### Phase B — Ticket Types (depends on Groups)
1. `GET /api/ops/ticket-types` — list with approval steps populated
2. `POST /api/ops/ticket-types` — create with nested approval steps
3. `GET /api/ops/ticket-types/[id]` — detail
4. `PUT /api/ops/ticket-types/[id]` — update, replace approval steps
5. `DELETE /api/ops/ticket-types/[id]` — deactivate

### Phase C — Tickets (depends on Ticket Types)
1. `GET /api/ops/tickets` — list with filters, pagination
2. `POST /api/ops/tickets` — create with auto-code, SLA calc, approval init
3. `GET /api/ops/tickets/[id]` — detail with all relations
4. `PUT /api/ops/tickets/[id]` — update
5. `POST /api/ops/tickets/[id]/transition` — state machine
6. `POST /api/ops/tickets/[id]/approvals` — sequential approval logic
7. `GET /api/ops/tickets/[id]/comments` — list
8. `POST /api/ops/tickets/[id]/comments` — create

### Phase D — Portal Auth (depends on Tickets for guard requests)
1. `POST /api/portal/guardia/auth` — bcrypt PIN validation, JWT session
2. `GET /api/portal/guardia/schedule` — real pauta query
3. `GET /api/portal/guardia/tickets` — guard's own tickets
4. Other portal routes (marcaciones, profile, documents, etc.)

## Section 3: Safety Strategy

1. **Isolated worktree** based on labor-events branch
2. **Single migration** creating all 7 models (they're interdependent)
3. **Seed script** for 6 default groups + 16 ticket types per tenant
4. **Build check** (`next build`) after each phase
5. **API smoke tests** via curl after each route replacement
6. **Zero UI changes** — only backend files modified
