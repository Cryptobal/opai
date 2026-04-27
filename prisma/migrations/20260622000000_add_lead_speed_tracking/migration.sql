-- Add speed-to-lead tracking columns
ALTER TABLE "crm"."leads"
  ADD COLUMN IF NOT EXISTS "first_viewed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "first_viewed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "first_contact_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "first_contact_by" TEXT,
  ADD COLUMN IF NOT EXISTS "first_contact_channel" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "escalated_at" TIMESTAMPTZ;

-- Index for escalation cron lookup (tenant + status + uncontacted + not yet escalated)
CREATE INDEX IF NOT EXISTS "idx_crm_leads_escalation"
  ON "crm"."leads" ("tenant_id", "status", "first_contact_at", "escalated_at");
