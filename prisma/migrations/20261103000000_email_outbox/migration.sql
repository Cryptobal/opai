-- Outbox de envío Gmail (PR-12, §7). Migración aditiva.
-- idempotency_key UNIQUE es la garantía de "reintento = 1 solo correo".

CREATE TABLE IF NOT EXISTS "crm"."email_outbox" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email_account_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "scheduled_at" TIMESTAMPTZ(6),
  "undo_until" TIMESTAMPTZ(6),
  "payload" JSONB NOT NULL,
  "provider_message_id" TEXT,
  "message_id" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_outbox_idempotency"
  ON "crm"."email_outbox" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_crm_email_outbox_due"
  ON "crm"."email_outbox" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "idx_crm_email_outbox_user"
  ON "crm"."email_outbox" ("tenant_id", "user_id", "status");
