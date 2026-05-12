-- Agrega ipc_expected_annual_pct al config de cashflow.
-- Se usa en la proyección para reajustar items CLP con has_ipc_adjustment=true,
-- mostrando el monto estimado en lugar del plano.

ALTER TABLE finance.finance_cashflow_config
  ADD COLUMN IF NOT EXISTS ipc_expected_annual_pct numeric(5, 2) NOT NULL DEFAULT 3.5;
