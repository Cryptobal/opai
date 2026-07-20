-- Sync incremental de Gmail: estado por casilla + dueño/threadId por hilo.
-- Todo aditivo (columnas nullable, sin backfill de datos).

-- Estado de backfill/incremental por casilla: { backfillPageToken, backfillDone, lastHistoryId, lastSyncAt }
ALTER TABLE "crm"."email_accounts" ADD COLUMN IF NOT EXISTS "sync_state" JSONB;

-- Dueño de la casilla + id de hilo Gmail para agrupar y deep-link.
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "email_account_id" UUID;
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "provider_thread_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_crm_email_threads_account_provider"
  ON "crm"."email_threads" ("email_account_id", "provider_thread_id");
