-- ════════════════════════════════════════════════════════════════
--  Cashflow · Tasa mensual de crecimiento de la UF (Fase D)
-- ════════════════════════════════════════════════════════════════
--
-- Para meses futuros donde no conocemos la UF real, proyectamos a
-- partir de la última UF conocida × (1 + tasa_mensual)^N. El default
-- 0 mantiene el comportamiento actual (UF constante en el futuro)
-- hasta que el usuario configure un valor.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "uf_monthly_growth_pct" DECIMAL(6,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "finance"."finance_cashflow_config"."uf_monthly_growth_pct"
  IS 'Crecimiento mensual de la UF en % (ej: 0.30 = 0,3% por mes). Sólo aplica a meses futuros — el actual y pasados usan la UF real. Default 0 = UF futura plana.';
