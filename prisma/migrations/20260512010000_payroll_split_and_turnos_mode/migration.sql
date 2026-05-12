-- Split de payroll (líquido + PreviRed) + modos de turnos extra
-- en finance_cashflow_config.

-- 1) Nuevos valores en el enum FinanceCashflowItemSource.
ALTER TYPE "finance"."FinanceCashflowItemSource" ADD VALUE IF NOT EXISTS 'PAYROLL_LIQUIDO';
ALTER TYPE "finance"."FinanceCashflowItemSource" ADD VALUE IF NOT EXISTS 'PAYROLL_PREVIRED';

-- 2) Nuevo enum para modo de turnos extra.
DO $$ BEGIN
  CREATE TYPE "finance"."FinanceTurnosExtraMode" AS ENUM ('HISTORICAL', 'PCT_PAYROLL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Columnas nuevas en finance_cashflow_config.
ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "previred_pay_day" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "turnos_extra_mode" "finance"."FinanceTurnosExtraMode" NOT NULL DEFAULT 'HISTORICAL';

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "turnos_extra_percentage" DECIMAL(6, 4) NOT NULL DEFAULT 0;
