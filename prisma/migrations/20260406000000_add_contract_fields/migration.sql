-- Add contract-related fields to CrmAccount
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "notary_name" TEXT;
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "notary_date" TEXT;

-- Add portal_visible to Document
ALTER TABLE "docs"."documents" ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT false;

-- Index for portal queries
CREATE INDEX IF NOT EXISTS "idx_documents_portal_visible" ON "docs"."documents"("tenant_id", "portal_visible");
