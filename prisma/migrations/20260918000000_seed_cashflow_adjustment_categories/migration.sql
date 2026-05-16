-- ────────────────────────────────────────────────────────────────────────────
-- Siembra idempotente de las dos categorías sistema de ajuste de
-- conciliación para todos los tenants con flujo de caja activo
-- (FinanceCashflowConfig).
--
-- Reemplaza al script standalone scripts/seed-cashflow-ajuste-categories.ts
-- para garantizar que se aplique en cada deploy futuro. Si la categoría ya
-- existe (constraint unique tenant_id+code), no hace nada.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO "finance"."finance_cashflow_categories" (
  id, tenant_id, code, name, kind, sort_order,
  is_system, is_active, is_tax_exempt, created_at, updated_at
)
SELECT
  uuid_generate_v4(),
  cfg.tenant_id,
  'ING_AJUSTE_CONCILIACION',
  'Ajuste de conciliación (ingreso)',
  'INCOME'::"finance"."FinanceCashflowItemKind",
  990,
  true,
  true,
  true,  -- is_tax_exempt: los ajustes son montos netos directos, no aplican IVA
  NOW(),
  NOW()
FROM "finance"."finance_cashflow_config" cfg
WHERE NOT EXISTS (
  SELECT 1 FROM "finance"."finance_cashflow_categories" cat
  WHERE cat.tenant_id = cfg.tenant_id
    AND cat.code = 'ING_AJUSTE_CONCILIACION'
);

INSERT INTO "finance"."finance_cashflow_categories" (
  id, tenant_id, code, name, kind, sort_order,
  is_system, is_active, is_tax_exempt, created_at, updated_at
)
SELECT
  uuid_generate_v4(),
  cfg.tenant_id,
  'EGR_AJUSTE_CONCILIACION',
  'Ajuste de conciliación (egreso)',
  'EXPENSE'::"finance"."FinanceCashflowItemKind",
  995,
  true,
  true,
  true,  -- is_tax_exempt: los ajustes son montos netos directos, no aplican IVA
  NOW(),
  NOW()
FROM "finance"."finance_cashflow_config" cfg
WHERE NOT EXISTS (
  SELECT 1 FROM "finance"."finance_cashflow_categories" cat
  WHERE cat.tenant_id = cfg.tenant_id
    AND cat.code = 'EGR_AJUSTE_CONCILIACION'
);

-- Defensive: si alguna categoría existe con is_active=false o is_system=false
-- o is_tax_exempt=false (estado inconsistente por edición manual), corregirla.
UPDATE "finance"."finance_cashflow_categories"
SET is_active = true, is_system = true, is_tax_exempt = true, updated_at = NOW()
WHERE code IN ('ING_AJUSTE_CONCILIACION', 'EGR_AJUSTE_CONCILIACION')
  AND (is_active = false OR is_system = false OR is_tax_exempt = false);
