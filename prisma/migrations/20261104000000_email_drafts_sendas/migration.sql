-- Borradores Gmail bidireccionales (C08) + cache de aliases sendAs (PR-10 §7).
-- Migración aditiva.

ALTER TABLE "crm"."email_messages"
  ADD COLUMN IF NOT EXISTS "is_draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "provider_draft_id" TEXT;

ALTER TABLE "crm"."email_accounts"
  ADD COLUMN IF NOT EXISTS "send_as" JSONB;

CREATE INDEX IF NOT EXISTS "idx_crm_email_messages_draft"
  ON "crm"."email_messages" ("email_account_id", "is_draft");
