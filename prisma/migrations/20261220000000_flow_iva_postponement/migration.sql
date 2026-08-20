-- Postergación de IVA en flujo de caja (SII art. 64 DL 825, hasta 2 meses).
-- Solo reubica hitos de caja: no altera F29, remanente ni Libro IVA.
-- ADD VALUE va primero y no se usa el enum en este archivo.

ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'IVA_POSTERGADO';

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "iva_postponed_pay_day" INTEGER NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS "finance"."finance_iva_postponements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "tax_period" TEXT NOT NULL,
    "original_pay_date" DATE NOT NULL,
    "postponed_pay_date" DATE NOT NULL,
    "deferred_amount_clp" DECIMAL(14, 2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_iva_postponements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_iva_postponement"
  ON "finance"."finance_iva_postponements"("tenant_id", "tax_period");

CREATE INDEX IF NOT EXISTS "idx_finance_iva_postponement_pay"
  ON "finance"."finance_iva_postponements"("tenant_id", "postponed_pay_date");
