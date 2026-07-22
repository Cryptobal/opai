-- DLQ de sync Gmail (PR-03, S12/T14): jobs veneno aparcados tras superar el
-- umbral de reintentos. Migración aditiva: no toca tablas existentes.

CREATE TABLE IF NOT EXISTS "crm"."email_sync_dead_letters" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "email_account_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "payload" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "parked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "email_sync_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_crm_email_sync_dlq_tenant"
  ON "crm"."email_sync_dead_letters" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_crm_email_sync_dlq_account"
  ON "crm"."email_sync_dead_letters" ("email_account_id", "resolved_at");
