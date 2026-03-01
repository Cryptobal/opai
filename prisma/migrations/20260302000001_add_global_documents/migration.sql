-- Add tenant_id, scope, and make installation_id nullable for global documents
ALTER TABLE "crm"."protocol_documents"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'installation';

-- Backfill tenant_id from installation
UPDATE "crm"."protocol_documents" pd
SET "tenant_id" = i."tenant_id"
FROM "crm"."installations" i
WHERE pd."installation_id" = i."id"
  AND pd."tenant_id" IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE "crm"."protocol_documents"
  ALTER COLUMN "tenant_id" SET NOT NULL;

-- Make installation_id nullable (for global documents)
ALTER TABLE "crm"."protocol_documents"
  ALTER COLUMN "installation_id" DROP NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS "idx_protocol_document_tenant_scope"
  ON "crm"."protocol_documents" ("tenant_id", "scope");
