-- ──────────────────────────────────────────────────────────────────────
-- Gmail bandeja v5 — acciones archivar / papelera / leído (ADITIVA).
--
--   1. crm.email_accounts.granted_scopes
--   2. crm.email_threads: archived_at, trashed_at, is_unread
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."email_accounts"
  ADD COLUMN IF NOT EXISTS "granted_scopes" TEXT;

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "trashed_at"  TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "is_unread"   BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_crm_email_threads_archived"
  ON "crm"."email_threads" ("email_account_id", "archived_at")
  WHERE "trashed_at" IS NULL;
