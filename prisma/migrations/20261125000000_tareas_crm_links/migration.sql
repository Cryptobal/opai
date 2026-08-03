-- ──────────────────────────────────────────────────────────────────────
-- Tareas: vinculación CRM en cascada (ADITIVA).
--
--   crm.tasks.quote_id         — cotización CPQ opcional
--   crm.tasks.installation_id  — instalación CRM opcional
--
-- Sin FK formales (mismo patrón que account_id / contact_id en tasks).
-- Idempotente. Sin backfill.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "quote_id" UUID;

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "installation_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_crm_tasks_quote"
  ON "crm"."tasks" ("quote_id");

CREATE INDEX IF NOT EXISTS "idx_crm_tasks_installation"
  ON "crm"."tasks" ("installation_id");
