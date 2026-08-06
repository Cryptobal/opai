-- CPQ: gastos financieros y garantías (base dinámica, póliza de garantía, RC)
-- Migración estrictamente aditiva + backfill de financial_base_mode.

ALTER TABLE cpq.quote_parameters
  ADD COLUMN IF NOT EXISTS financial_base_mode VARCHAR(10) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS policy_amount_mode VARCHAR(10) NOT NULL DEFAULT 'pct',
  ADD COLUMN IF NOT EXISTS policy_fixed_amount_uf DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liability_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liability_mode VARCHAR(10) NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS liability_rate_pct DECIMAL(6, 4) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS liability_annual_premium_uf DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liability_allocation_pct DECIMAL(6, 2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS liability_deductible_uf DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Cotizaciones enviadas/aceptadas/rechazadas con base congelada quedan en modo manual
-- para no alterar el precio ya comunicado. Los borradores quedan en 'auto'.
UPDATE cpq.quote_parameters p
SET financial_base_mode = 'manual'
FROM cpq.quotes q
WHERE q.id = p.quote_id
  AND p.sale_price_base > 0
  AND q.status <> 'draft';
