-- F1: ciclo de vida de tenant, auditoría de plataforma y solicitudes de upgrade.
-- Aditivo: no modifica ni borra datos existentes.

ALTER TABLE "public"."tenant_plans"
  ADD COLUMN IF NOT EXISTS "grace_ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status_reason" TEXT;

CREATE INDEX IF NOT EXISTS "tenant_plans_billing_status_trial_ends_at_idx"
  ON "public"."tenant_plans"("billing_status", "trial_ends_at");

CREATE INDEX IF NOT EXISTS "tenant_plans_billing_status_grace_ends_at_idx"
  ON "public"."tenant_plans"("billing_status", "grace_ends_at");

CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_email" TEXT,
  "action" TEXT NOT NULL,
  "tenant_id" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_audit_logs_tenant_id_created_at_idx"
  ON "public"."platform_audit_logs"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "platform_audit_logs_action_created_at_idx"
  ON "public"."platform_audit_logs"("action", "created_at");

ALTER TABLE "public"."platform_audit_logs"
  DROP CONSTRAINT IF EXISTS "platform_audit_logs_tenant_id_fkey";

ALTER TABLE "public"."platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."upgrade_requests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "requested_plan" TEXT,
  "requested_addons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "handled_by" TEXT,
  "handled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "upgrade_requests_status_created_at_idx"
  ON "public"."upgrade_requests"("status", "created_at");

CREATE INDEX IF NOT EXISTS "upgrade_requests_tenant_id_created_at_idx"
  ON "public"."upgrade_requests"("tenant_id", "created_at");

ALTER TABLE "public"."upgrade_requests"
  DROP CONSTRAINT IF EXISTS "upgrade_requests_tenant_id_fkey";

ALTER TABLE "public"."upgrade_requests"
  ADD CONSTRAINT "upgrade_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
