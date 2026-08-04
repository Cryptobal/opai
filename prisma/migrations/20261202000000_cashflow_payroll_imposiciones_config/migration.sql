-- Proyección de caja Previred: AFP y tasa de mutualidad por tenant.
-- ADITIVO e idempotente. Nullable, sin backfill, sin DROP.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "payroll_afp_name" TEXT;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "payroll_mutual_rate_pct" DECIMAL(6, 4);
