-- ──────────────────────────────────────────────────────────────────────
-- Espejo Gmail — estado SPAM por hilo (ADITIVA).
--
--   crm.email_threads.spam_at
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "spam_at" TIMESTAMPTZ(6);
