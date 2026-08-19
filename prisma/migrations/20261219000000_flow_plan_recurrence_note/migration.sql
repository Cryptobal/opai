-- Nota de desglose en egreso recurrente de plan (se estampa en celdas al materializar).
ALTER TABLE "finance"."finance_flow_plan_recurrences"
  ADD COLUMN IF NOT EXISTS "note" TEXT;
