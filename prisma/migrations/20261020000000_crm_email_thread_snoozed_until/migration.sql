-- ──────────────────────────────────────────────────────────────────────
-- Posponer (snooze) espejado con Gmail — estado propio de OPAI (ADITIVA).
--
--   crm.email_threads.snoozed_until
--   idx_crm_email_threads_snoozed (tenant_id, snoozed_until)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "snoozed_until" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_crm_email_threads_snoozed"
  ON "crm"."email_threads" ("tenant_id", "snoozed_until");
