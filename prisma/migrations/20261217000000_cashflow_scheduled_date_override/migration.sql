-- Additive: override de visibilidad de cuotas programadas (P) en el flujo.
-- Una fila por (tenant, template, billingPeriod). No toca el template ni el SII.

CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_scheduled_date_overrides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "billing_period" TEXT NOT NULL,
    "original_date" DATE NOT NULL,
    "custom_date" DATE NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_cashflow_scheduled_date_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_scheduled_date_override"
  ON "finance"."finance_cashflow_scheduled_date_overrides"("tenant_id", "template_id", "billing_period");

CREATE INDEX IF NOT EXISTS "idx_cashflow_scheduled_date_override_custom"
  ON "finance"."finance_cashflow_scheduled_date_overrides"("tenant_id", "custom_date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_cashflow_scheduled_date_overrides_template_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_cashflow_scheduled_date_overrides"
      ADD CONSTRAINT "finance_cashflow_scheduled_date_overrides_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "finance"."finance_dte_recurring_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
