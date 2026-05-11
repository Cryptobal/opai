-- Comisión por defecto del factoring pasa de porcentaje a monto fijo en CLP.
-- En la práctica los factorings cobran un monto fijo, no un %, así que la UI
-- expone "Comisión default (CLP)". La columna histórica
-- `default_commission_pct` se mantiene para no perder data legacy de tenants
-- que ya hubieran configurado un %, pero la UI nueva no la lee ni escribe.
ALTER TABLE "finance"."finance_factoring_companies"
  ADD COLUMN IF NOT EXISTS "default_commission_amount" DECIMAL(14, 2);
