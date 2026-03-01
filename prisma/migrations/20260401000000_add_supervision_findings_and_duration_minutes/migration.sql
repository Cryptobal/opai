-- Add duration_minutes to visitas_supervision (idempotent)
ALTER TABLE "ops"."visitas_supervision" ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER;

-- Create supervision_findings table if not exists
CREATE TABLE IF NOT EXISTS "ops"."supervision_findings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "guard_id" UUID,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "description" TEXT NOT NULL,
    "photo_url" TEXT,
    "ticket_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ(6),
    "verified_in_visit_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervision_findings_pkey" PRIMARY KEY ("id")
);

-- Create indexes if not exist (PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_tenant" ON "ops"."supervision_findings"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_visit" ON "ops"."supervision_findings"("visit_id");
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_installation" ON "ops"."supervision_findings"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_guard" ON "ops"."supervision_findings"("guard_id");
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_status" ON "ops"."supervision_findings"("status");

-- Add foreign keys only if table was just created (avoid errors if already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_tenant_id_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_visit_id_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_visit_id_fkey"
        FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_installation_id_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_installation_id_fkey"
        FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_guard_id_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_guard_id_fkey"
        FOREIGN KEY ("guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_ticket_id_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_ticket_id_fkey"
        FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'supervision_findings_verified_visit_fkey'
        AND table_schema = 'ops' AND table_name = 'supervision_findings'
    ) THEN
        ALTER TABLE "ops"."supervision_findings"
        ADD CONSTRAINT "supervision_findings_verified_visit_fkey"
        FOREIGN KEY ("verified_in_visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
