-- Flujo v4.6 — corte de cartera antigua (aditivo, reversible con NULL).
-- DTEs de ingreso emitidos antes de flow_cutoff_ymd quedan fuera de
-- comprometido / drill / bandeja / KPI de cartera; la capa real intacta.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "flow_cutoff_ymd" DATE;
