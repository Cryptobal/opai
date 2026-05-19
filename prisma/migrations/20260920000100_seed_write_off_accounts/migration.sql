-- ────────────────────────────────────────────────────────────────────────────
-- Siembra idempotente de cuentas contables de "Diferencias en cobranza"
-- para todos los tenants con FinanceCashflowConfig activo.
--
-- Crea dos cuentas:
--   4.4.95.001 "Diferencias en cobranza - pérdida"  (EXPENSE / DEBIT)
--   3.3.95.001 "Diferencias en cobranza - ganancia" (REVENUE / CREDIT)
--
-- Luego rellena writeOffShortPaymentAccountId y writeOffOverPaymentAccountId
-- en finance_cashflow_config con los IDs de esas cuentas, solo si están NULL
-- (no sobrescribe configuración manual previa).
-- ────────────────────────────────────────────────────────────────────────────

-- Cuenta pérdida (cliente pagó menos)
INSERT INTO "finance"."finance_account_plan" (
  id, tenant_id, code, name, type, nature, level,
  is_system, is_active, accepts_entries, description,
  created_at, updated_at
)
SELECT
  uuid_generate_v4(),
  cfg.tenant_id,
  '4.4.95.001',
  'Diferencias en cobranza - pérdida',
  'EXPENSE'::"finance"."FinanceAccountType",
  'DEBIT'::"finance"."FinanceAccountNature",
  4,
  true,
  true,
  true,
  'Ajuste automático cuando el cliente paga menos de lo facturado dentro del umbral configurado (varianza UF, redondeos, comisiones).',
  NOW(),
  NOW()
FROM "finance"."finance_cashflow_config" cfg
WHERE NOT EXISTS (
  SELECT 1 FROM "finance"."finance_account_plan" ap
  WHERE ap.tenant_id = cfg.tenant_id
    AND ap.code = '4.4.95.001'
);

-- Cuenta ganancia (cliente pagó más)
INSERT INTO "finance"."finance_account_plan" (
  id, tenant_id, code, name, type, nature, level,
  is_system, is_active, accepts_entries, description,
  created_at, updated_at
)
SELECT
  uuid_generate_v4(),
  cfg.tenant_id,
  '3.3.95.001',
  'Diferencias en cobranza - ganancia',
  'REVENUE'::"finance"."FinanceAccountType",
  'CREDIT'::"finance"."FinanceAccountNature",
  4,
  true,
  true,
  true,
  'Ajuste automático cuando el cliente paga más de lo facturado dentro del umbral configurado.',
  NOW(),
  NOW()
FROM "finance"."finance_cashflow_config" cfg
WHERE NOT EXISTS (
  SELECT 1 FROM "finance"."finance_account_plan" ap
  WHERE ap.tenant_id = cfg.tenant_id
    AND ap.code = '3.3.95.001'
);

-- Asociar las cuentas al config (solo si están NULL)
UPDATE "finance"."finance_cashflow_config" cfg
SET write_off_short_payment_account_id = ap.id
FROM "finance"."finance_account_plan" ap
WHERE ap.tenant_id = cfg.tenant_id
  AND ap.code = '4.4.95.001'
  AND cfg.write_off_short_payment_account_id IS NULL;

UPDATE "finance"."finance_cashflow_config" cfg
SET write_off_over_payment_account_id = ap.id
FROM "finance"."finance_account_plan" ap
WHERE ap.tenant_id = cfg.tenant_id
  AND ap.code = '3.3.95.001'
  AND cfg.write_off_over_payment_account_id IS NULL;
