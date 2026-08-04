-- Papelera restaurable para cotizaciones CPQ (retención lógica: 30 días).
CREATE TABLE IF NOT EXISTS "cpq"."quote_trash" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "quote_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL,
  "account_id" UUID,
  "deal_id" UUID,
  "bundle_id" UUID,
  "installation_name" TEXT,
  "sale_price_monthly" DECIMAL(14,2),
  "payload" JSONB NOT NULL,
  "reason" TEXT,
  "deleted_by" TEXT,
  "deleted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "restored_at" TIMESTAMPTZ(6),
  CONSTRAINT "quote_trash_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_cpq_quote_trash_tenant_deleted"
  ON "cpq"."quote_trash" ("tenant_id", "deleted_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_cpq_quote_trash_expires"
  ON "cpq"."quote_trash" ("expires_at");
