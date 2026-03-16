-- Fix column types: tenant_id and sent_by_id are cuid strings (TEXT), not UUID
-- The original migration incorrectly created them as UUID columns

ALTER TABLE "crm"."company_presentations" ALTER COLUMN "tenant_id" TYPE TEXT;
ALTER TABLE "crm"."company_presentations" ALTER COLUMN "sent_by_id" TYPE TEXT;
