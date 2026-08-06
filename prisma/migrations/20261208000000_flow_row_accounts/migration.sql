-- Flujo de caja v3: renglón dueño de sus cuentas contables.
-- Aditiva: sin DROP, sin NOT NULL sobre columnas existentes, sin borrado de datos.
-- ALTER TYPE ADD VALUE debe ir fuera de bloque transaccional explícito.

ALTER TYPE "finance"."FlowRowMapping" ADD VALUE IF NOT EXISTS 'ACCOUNTS';

CREATE TYPE "finance"."FlowRowKey" AS ENUM (
  'BANDEJA_INGRESO',
  'BANDEJA_EGRESO',
  'SUELDO',
  'QUINCENA',
  'PREVIRED',
  'TURNO_EXTRA',
  'FINIQUITO',
  'IVA_F29',
  'OTRO_IMPUESTO',
  'FACTORING',
  'RETIRO_SOCIO',
  'DEVOL_PRESTAMO_SOCIO',
  'APORTE_SOCIO',
  'CREDITO'
);

ALTER TABLE "finance"."finance_flow_rows"
  ADD COLUMN IF NOT EXISTS "canonical_key" "finance"."FlowRowKey";

CREATE TABLE IF NOT EXISTS "finance"."finance_flow_row_accounts" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "row_id" UUID NOT NULL,
  "account_plan_id" UUID NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_default_target" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finance_flow_row_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_flow_row_account"
  ON "finance"."finance_flow_row_accounts" ("row_id", "account_plan_id");

CREATE INDEX IF NOT EXISTS "idx_flow_row_account_tenant_account"
  ON "finance"."finance_flow_row_accounts" ("tenant_id", "account_plan_id");

-- Unique parcial: una llave canónica por tenant entre renglones activos.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_flow_row_canonical_key"
  ON "finance"."finance_flow_rows" ("tenant_id", "canonical_key")
  WHERE "canonical_key" IS NOT NULL AND "archived_at" IS NULL;

-- Unique parcial: un destino por defecto por cuenta contable del tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_flow_row_account_default"
  ON "finance"."finance_flow_row_accounts" ("tenant_id", "account_plan_id")
  WHERE "is_default_target";

-- Unique parcial: una cuenta primaria por renglón.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_flow_row_account_primary"
  ON "finance"."finance_flow_row_accounts" ("row_id")
  WHERE "is_primary";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_flow_row_accounts_row_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_flow_row_accounts"
      ADD CONSTRAINT "finance_flow_row_accounts_row_id_fkey"
      FOREIGN KEY ("row_id") REFERENCES "finance"."finance_flow_rows"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_flow_row_accounts_account_plan_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_flow_row_accounts"
      ADD CONSTRAINT "finance_flow_row_accounts_account_plan_id_fkey"
      FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
