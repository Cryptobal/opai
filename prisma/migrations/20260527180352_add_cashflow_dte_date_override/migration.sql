-- Tabla overlay de fecha por DTE para módulo Flujo de Caja
CREATE TABLE "finance"."finance_cashflow_dte_date_overrides" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" text NOT NULL,
    "dte_id" uuid NOT NULL,
    "original_date" date NOT NULL,
    "custom_date" date NOT NULL,
    "reason" text,
    "created_by" text NOT NULL,
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(6) NOT NULL,
    CONSTRAINT "finance_cashflow_dte_date_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_cashflow_dte_date_override"
  ON "finance"."finance_cashflow_dte_date_overrides" ("tenant_id", "dte_id");

CREATE INDEX "idx_cashflow_dte_date_override_custom"
  ON "finance"."finance_cashflow_dte_date_overrides" ("tenant_id", "custom_date");

ALTER TABLE "finance"."finance_cashflow_dte_date_overrides"
  ADD CONSTRAINT "finance_cashflow_dte_date_overrides_dte_id_fkey"
  FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
