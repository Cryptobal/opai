-- CpqProposalBundle + CpqProposalBundleQuote (aditivo, schema cpq).
-- Agrupa N cotizaciones hermanas como unidad enviable consolidada.
-- Sin backfill; sin cambios destructivos.

CREATE TABLE IF NOT EXISTS "cpq"."proposal_bundles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "account_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UF',
    "valid_until" DATE,
    "notes" TEXT,
    "visible_in_client_portal" BOOLEAN,
    "proposal_template_id" UUID,
    "proposal_ai_content" JSONB,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proposal_bundles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "proposal_bundles_code_key"
  ON "cpq"."proposal_bundles"("code");
CREATE INDEX IF NOT EXISTS "idx_cpq_proposal_bundles_tenant"
  ON "cpq"."proposal_bundles"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_cpq_proposal_bundles_deal"
  ON "cpq"."proposal_bundles"("deal_id");
CREATE INDEX IF NOT EXISTS "idx_cpq_proposal_bundles_status"
  ON "cpq"."proposal_bundles"("status");

CREATE TABLE IF NOT EXISTS "cpq"."proposal_bundle_quotes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bundle_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "included_in_proposal" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proposal_bundle_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "proposal_bundle_quotes_quote_id_key"
  ON "cpq"."proposal_bundle_quotes"("quote_id");
CREATE INDEX IF NOT EXISTS "idx_cpq_proposal_bundle_quotes_tenant"
  ON "cpq"."proposal_bundle_quotes"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_cpq_proposal_bundle_quotes_bundle"
  ON "cpq"."proposal_bundle_quotes"("bundle_id");

DO $$ BEGIN
  ALTER TABLE "cpq"."proposal_bundle_quotes"
    ADD CONSTRAINT "proposal_bundle_quotes_bundle_id_fkey"
    FOREIGN KEY ("bundle_id") REFERENCES "cpq"."proposal_bundles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cpq"."proposal_bundle_quotes"
    ADD CONSTRAINT "proposal_bundle_quotes_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "cpq"."quotes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
