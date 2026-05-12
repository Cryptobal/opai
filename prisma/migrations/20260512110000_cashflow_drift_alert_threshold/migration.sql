-- Umbral configurable por tenant para alertar drift de caja persistente.
-- 100.000 CLP es un default conservador para empresas medianas.
ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "drift_alert_threshold_clp" INTEGER NOT NULL DEFAULT 100000;
