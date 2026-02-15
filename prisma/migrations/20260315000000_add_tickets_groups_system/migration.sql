-- CreateTable: admin_groups (public schema)
CREATE TABLE "public"."admin_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: admin_group_memberships (public schema)
CREATE TABLE "public"."admin_group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_ticket_types (ops schema)
CREATE TABLE "ops"."ops_ticket_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'internal',
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "assigned_team" TEXT NOT NULL,
    "default_priority" TEXT NOT NULL DEFAULT 'p3',
    "sla_hours" INTEGER NOT NULL DEFAULT 72,
    "icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops_ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_ticket_type_approval_steps (ops schema)
CREATE TABLE "ops"."ops_ticket_type_approval_steps" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_type_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" TEXT NOT NULL DEFAULT 'group',
    "approver_group_id" TEXT,
    "approver_user_id" TEXT,
    "label" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ops_ticket_type_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_tickets (ops schema)
CREATE TABLE "ops"."ops_tickets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ticket_type_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'p3',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_team" TEXT NOT NULL,
    "assigned_to" TEXT,
    "installation_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_guard_event_id" TEXT,
    "guardia_id" UUID,
    "reported_by" TEXT NOT NULL,
    "sla_due_at" TIMESTAMPTZ(6),
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "resolution_notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "current_approval_step" INTEGER,
    "approval_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_ticket_approvals (ops schema)
CREATE TABLE "ops"."ops_ticket_approvals" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_label" TEXT NOT NULL,
    "approver_type" TEXT NOT NULL,
    "approver_group_id" TEXT,
    "approver_user_id" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decided_by_id" TEXT,
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_ticket_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops_ticket_comments (ops schema)
CREATE TABLE "ops"."ops_ticket_comments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_admin_groups_tenant_slug" ON "public"."admin_groups"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "idx_admin_groups_tenant" ON "public"."admin_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_admin_group_memberships_group_admin" ON "public"."admin_group_memberships"("group_id", "admin_id");

-- CreateIndex
CREATE INDEX "idx_admin_group_memberships_group" ON "public"."admin_group_memberships"("group_id");

-- CreateIndex
CREATE INDEX "idx_admin_group_memberships_admin" ON "public"."admin_group_memberships"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ops_ticket_types_tenant_slug" ON "ops"."ops_ticket_types"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_types_tenant" ON "ops"."ops_ticket_types"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_types_tenant_active" ON "ops"."ops_ticket_types"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_type_approval_steps_type" ON "ops"."ops_ticket_type_approval_steps"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ops_tickets_tenant_code" ON "ops"."ops_tickets"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "idx_ops_tickets_tenant" ON "ops"."ops_tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ops_tickets_tenant_status" ON "ops"."ops_tickets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_ops_tickets_tenant_team" ON "ops"."ops_tickets"("tenant_id", "assigned_team");

-- CreateIndex
CREATE INDEX "idx_ops_tickets_guardia" ON "ops"."ops_tickets"("guardia_id");

-- CreateIndex
CREATE INDEX "idx_ops_tickets_type" ON "ops"."ops_tickets"("ticket_type_id");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_approvals_ticket" ON "ops"."ops_ticket_approvals"("ticket_id");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_approvals_ticket_step" ON "ops"."ops_ticket_approvals"("ticket_id", "step_order");

-- CreateIndex
CREATE INDEX "idx_ops_ticket_comments_ticket" ON "ops"."ops_ticket_comments"("ticket_id");

-- AddForeignKey
ALTER TABLE "public"."admin_groups" ADD CONSTRAINT "admin_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_group_memberships" ADD CONSTRAINT "admin_group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."admin_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_group_memberships" ADD CONSTRAINT "admin_group_memberships_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_type_approval_steps" ADD CONSTRAINT "ops_ticket_type_approval_steps_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ops"."ops_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_type_approval_steps" ADD CONSTRAINT "ops_ticket_type_approval_steps_approver_group_id_fkey" FOREIGN KEY ("approver_group_id") REFERENCES "public"."admin_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_tickets" ADD CONSTRAINT "ops_tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ops"."ops_ticket_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_tickets" ADD CONSTRAINT "ops_tickets_guardia_id_fkey" FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_approvals" ADD CONSTRAINT "ops_ticket_approvals_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."ops_ticket_comments" ADD CONSTRAINT "ops_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
