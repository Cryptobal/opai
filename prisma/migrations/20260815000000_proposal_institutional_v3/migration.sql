-- Aditiva: biblioteca de secciones fijas institucionales, flag de cuenta
-- de referencia en propuestas, e indicadores publicables (Setting JSON).

CREATE TABLE IF NOT EXISTS "cpq"."fixed_sections" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fixed_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cpq_fixed_sections_tenant_key"
  ON "cpq"."fixed_sections" ("tenant_id", "key");

CREATE INDEX IF NOT EXISTS "idx_cpq_fixed_sections_tenant_active_sort"
  ON "cpq"."fixed_sections" ("tenant_id", "active", "sort_order");

ALTER TABLE "crm"."accounts"
  ADD COLUMN IF NOT EXISTS "use_as_reference" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_crm_accounts_use_as_reference"
  ON "crm"."accounts" ("tenant_id", "use_as_reference");
