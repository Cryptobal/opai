-- Modelo documental unificado: columnas aditivas en crm.files, role en file_links,
-- DocsMigrationState, índice único parcial de owner. Sin DROP TABLE/COLUMN.

-- 1) Documento: storage_key nullable + campos de vigencia/escalera/legado
ALTER TABLE "crm"."files" ALTER COLUMN "storage_key" DROP NOT NULL;

ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "tipo_id" UUID;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "issued_at" DATE;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "expires_at" DATE;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "validated_by" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "validated_at" TIMESTAMPTZ(6);
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "last_expiry_milestone" INTEGER;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "last_expiry_milestone_at" TIMESTAMPTZ(6);
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "renewal_in_progress_until" DATE;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "renewal_marked_by" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "renewal_marked_at" TIMESTAMPTZ(6);
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "expiry_dismissed_at" TIMESTAMPTZ(6);
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "expiry_dismissed_by" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "expiry_dismissed_reason" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "file_url" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "legacy_source" TEXT;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "legacy_id" UUID;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "needs_classification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "needs_attention" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_crm_files_tipo" ON "crm"."files"("tenant_id", "tipo_id");
CREATE INDEX IF NOT EXISTS "idx_crm_files_expires" ON "crm"."files"("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_files_legacy"
  ON "crm"."files"("tenant_id", "legacy_source", "legacy_id")
  WHERE "legacy_source" IS NOT NULL AND "legacy_id" IS NOT NULL;

-- FK tipo → ops.tipos_doc_operacional (nullable)
DO $$ BEGIN
  ALTER TABLE "crm"."files"
    ADD CONSTRAINT "files_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "ops"."tipos_doc_operacional"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) DocumentoEnlace.role + backfill (más antiguo = owner)
ALTER TABLE "crm"."file_links" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'owner';

UPDATE "crm"."file_links" fl
SET "role" = CASE
  WHEN fl.id = oldest.id THEN 'owner'
  ELSE 'reference'
END
FROM (
  SELECT DISTINCT ON ("file_id") "id", "file_id"
  FROM "crm"."file_links"
  ORDER BY "file_id", "created_at" ASC, "id" ASC
) AS oldest
WHERE fl."file_id" = oldest."file_id";

CREATE INDEX IF NOT EXISTS "idx_crm_file_links_role" ON "crm"."file_links"("role");

CREATE UNIQUE INDEX IF NOT EXISTS uq_documento_owner
  ON crm.file_links (file_id) WHERE role = 'owner';

-- 3) Estado de migración por tenant
CREATE TABLE IF NOT EXISTS "public"."docs_migration_state" (
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "cursor_legacy" TEXT,
  "stats" JSONB,
  "parity_report" JSONB,
  "failure_reason" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "docs_migration_state_pkey" PRIMARY KEY ("tenant_id")
);

DO $$ BEGIN
  ALTER TABLE "public"."docs_migration_state"
    ADD CONSTRAINT "docs_migration_state_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
