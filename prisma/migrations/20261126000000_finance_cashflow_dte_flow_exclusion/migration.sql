-- Additive: exclusiones de DTE del flujo de caja (capa planilla; ledger intacto).
-- El modelo ya estaba en schema.prisma; esta migración materializa la tabla
-- si aún no existe (entornos que solo corren migrate deploy).

CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_dte_flow_exclusions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "dte_id" UUID NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_cashflow_dte_flow_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_dte_flow_exclusion"
  ON "finance"."finance_cashflow_dte_flow_exclusions"("tenant_id", "dte_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_dte_flow_exclusion_tenant"
  ON "finance"."finance_cashflow_dte_flow_exclusions"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_cashflow_dte_flow_exclusions_dte_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_cashflow_dte_flow_exclusions"
      ADD CONSTRAINT "finance_cashflow_dte_flow_exclusions_dte_id_fkey"
      FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
