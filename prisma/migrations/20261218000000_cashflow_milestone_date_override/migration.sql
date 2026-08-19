-- Additive: override de visibilidad de hitos de egreso (quincena, sueldos, etc.).
-- No cambia el día de pago configurado ni el cómputo del hito.

CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_milestone_date_overrides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "milestone_key" TEXT NOT NULL,
    "billing_period" TEXT NOT NULL,
    "original_date" DATE NOT NULL,
    "custom_date" DATE NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_cashflow_milestone_date_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_milestone_date_override"
  ON "finance"."finance_cashflow_milestone_date_overrides"("tenant_id", "milestone_key", "billing_period");

CREATE INDEX IF NOT EXISTS "idx_cashflow_milestone_date_override_custom"
  ON "finance"."finance_cashflow_milestone_date_overrides"("tenant_id", "custom_date");
