-- Documentos laborales: alcance por instalación, firmantes de plantilla,
-- firmantes de empresa, campañas masivas y auto-estampado.
-- 100% aditivo.

ALTER TABLE "docs"."doc_templates"
  ADD COLUMN IF NOT EXISTS "scope_type" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "signing_mode" TEXT NOT NULL DEFAULT 'sequential';

ALTER TABLE "docs"."doc_signature_recipients"
  ADD COLUMN IF NOT EXISTS "auto_stamp" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "docs"."doc_template_installations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_template_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_doc_template_installation"
  ON "docs"."doc_template_installations"("template_id", "installation_id");
CREATE INDEX IF NOT EXISTS "idx_doc_template_installations_tenant"
  ON "docs"."doc_template_installations"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_doc_template_installations_installation"
  ON "docs"."doc_template_installations"("installation_id");

CREATE TABLE IF NOT EXISTS "docs"."doc_template_signers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "signer_ref_id" TEXT,
    "name" TEXT,
    "email" TEXT,
    "signing_order" INTEGER NOT NULL,
    "auto_stamp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_template_signers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_doc_template_signer_order"
  ON "docs"."doc_template_signers"("template_id", "signing_order");
CREATE INDEX IF NOT EXISTS "idx_doc_template_signers_tenant"
  ON "docs"."doc_template_signers"("tenant_id");

CREATE TABLE IF NOT EXISTS "docs"."doc_tenant_signers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rut" TEXT,
    "signature_storage_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_tenant_signers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_doc_tenant_signers_tenant"
  ON "docs"."doc_tenant_signers"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_doc_tenant_signers_role"
  ON "docs"."doc_tenant_signers"("tenant_id", "role", "is_active");

CREATE TABLE IF NOT EXISTS "docs"."doc_bulk_campaigns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totals" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_bulk_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_doc_bulk_campaigns_tenant"
  ON "docs"."doc_bulk_campaigns"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_doc_bulk_campaigns_tenant_status"
  ON "docs"."doc_bulk_campaigns"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_doc_bulk_campaigns_template"
  ON "docs"."doc_bulk_campaigns"("template_id");

CREATE TABLE IF NOT EXISTS "docs"."doc_bulk_campaign_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "campaign_id" UUID NOT NULL,
    "guardia_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "document_id" UUID,
    "error" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_bulk_campaign_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_doc_bulk_campaign_item"
  ON "docs"."doc_bulk_campaign_items"("campaign_id", "guardia_id");
CREATE INDEX IF NOT EXISTS "idx_doc_bulk_campaign_items_tenant"
  ON "docs"."doc_bulk_campaign_items"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_doc_bulk_campaign_items_status"
  ON "docs"."doc_bulk_campaign_items"("campaign_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doc_template_installations_template_id_fkey'
  ) THEN
    ALTER TABLE "docs"."doc_template_installations"
      ADD CONSTRAINT "doc_template_installations_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "docs"."doc_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doc_template_signers_template_id_fkey'
  ) THEN
    ALTER TABLE "docs"."doc_template_signers"
      ADD CONSTRAINT "doc_template_signers_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "docs"."doc_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doc_bulk_campaigns_template_id_fkey'
  ) THEN
    ALTER TABLE "docs"."doc_bulk_campaigns"
      ADD CONSTRAINT "doc_bulk_campaigns_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "docs"."doc_templates"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doc_bulk_campaign_items_campaign_id_fkey'
  ) THEN
    ALTER TABLE "docs"."doc_bulk_campaign_items"
      ADD CONSTRAINT "doc_bulk_campaign_items_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "docs"."doc_bulk_campaigns"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
