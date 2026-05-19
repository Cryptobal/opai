-- ────────────────────────────────────────────────────────────────────────────
-- Agrega 5 columnas a finance_cashflow_config para configurar el write-off
-- automático de diferencias menores en conciliación bancaria.
--
-- writeOffAutoEnabled            -> activa el motor (default true)
-- writeOffMaxAmountClp           -> umbral absoluto (default 10.000 CLP)
-- writeOffMaxPercent             -> umbral relativo, fracción (default 0.005 = 0,5%)
-- writeOffShortPaymentAccountId  -> cuenta para "cliente pagó menos"
-- writeOffOverPaymentAccountId   -> cuenta para "cliente pagó más"
--
-- Las FKs quedan como columnas UUID sueltas sin REFERENCES porque las
-- validamos en el servicio (mantiene el schema mínimo y permite borrar
-- cuentas históricas sin bloquear la config).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "write_off_auto_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "write_off_max_amount_clp" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS "write_off_max_percent" DECIMAL(6,4) NOT NULL DEFAULT 0.005,
  ADD COLUMN IF NOT EXISTS "write_off_short_payment_account_id" UUID,
  ADD COLUMN IF NOT EXISTS "write_off_over_payment_account_id" UUID;
