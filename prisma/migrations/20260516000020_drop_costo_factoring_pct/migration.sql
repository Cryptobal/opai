-- FIX urgente: el campo costo_factoring_pct se eliminó del modelo
-- porque el costo de factoring se conoce al factorizar cada factura
-- (modal al emitir), no al configurar el contrato. El constraint
-- chk_cashflow_factoring_costo bloqueaba UPDATEs sobre items con
-- modo_cobro=FACTORING que no tenían costo poblado.

ALTER TABLE finance.finance_cashflow_items
  DROP CONSTRAINT IF EXISTS chk_cashflow_factoring_costo;

ALTER TABLE finance.finance_cashflow_items
  DROP COLUMN IF EXISTS costo_factoring_pct;
