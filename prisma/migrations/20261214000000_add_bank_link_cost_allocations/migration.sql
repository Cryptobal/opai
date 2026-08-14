-- Aditiva: distribución de centro de costo en vínculos bancarios.
-- Prefill de política en plan de cuentas. Sin DROP, sin ALTER COLUMN.

CREATE TYPE "finance"."FinanceCostAllocationDriver" AS ENUM (
  'MANUAL',
  'EQUAL',
  'ACTIVE_GUARDS',
  'REQUIRED_GUARDS'
);

CREATE TYPE "finance"."FinanceCostCenterPolicy" AS ENUM (
  'NONE',
  'OPTIONAL',
  'DIRECT',
  'ALLOCABLE'
);

ALTER TABLE "finance"."finance_account_plan"
  ADD COLUMN "cost_center_policy" "finance"."FinanceCostCenterPolicy" NOT NULL DEFAULT 'OPTIONAL';

CREATE TABLE "finance"."finance_bank_link_allocations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "link_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "cost_center_id" UUID,
  "amount" DECIMAL(14, 2) NOT NULL,
  "weight" DECIMAL(12, 6) NOT NULL,
  "driver" "finance"."FinanceCostAllocationDriver" NOT NULL,
  "driver_value" DECIMAL(12, 2),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finance_bank_link_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "finance"."finance_bank_link_allocations"
  ADD CONSTRAINT "finance_bank_link_allocations_link_id_fkey"
  FOREIGN KEY ("link_id") REFERENCES "finance"."finance_bank_transaction_links"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_bank_link_allocations"
  ADD CONSTRAINT "finance_bank_link_allocations_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."finance_bank_link_allocations"
  ADD CONSTRAINT "finance_bank_link_allocations_cost_center_id_fkey"
  FOREIGN KEY ("cost_center_id") REFERENCES "finance"."finance_cost_centers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_finance_bank_link_alloc_link_inst"
  ON "finance"."finance_bank_link_allocations" ("link_id", "installation_id");

CREATE INDEX "idx_finance_bank_link_alloc_tenant_inst"
  ON "finance"."finance_bank_link_allocations" ("tenant_id", "installation_id");

CREATE INDEX "idx_finance_bank_link_alloc_link"
  ON "finance"."finance_bank_link_allocations" ("link_id");
