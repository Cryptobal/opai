-- Tasa PPM (Pago Provisional Mensual) en % sobre ingresos brutos del giro.
-- Se usa en el cálculo del F29 (Libro IVA) y en la proyección de cashflow.
ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "ppm_rate_pct" DECIMAL(6,4) NOT NULL DEFAULT 0;
