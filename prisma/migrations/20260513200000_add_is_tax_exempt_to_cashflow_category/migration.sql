-- Agrega flag isTaxExempt a categorías de flujo de caja.
-- El cashflow muestra valores BRUTOS (con IVA incluido) porque representa
-- movimiento bancario; los items se mantienen en NETO (compatible con
-- contabilidad). La proyección multiplica por 1.19 cuando la categoría
-- NO es exenta. Marcamos como exentas las categorías cuyos montos ya son
-- valor de caja directo: sueldos líquidos, cotizaciones, impuestos,
-- retiros y ajustes.

ALTER TABLE "finance"."finance_cashflow_categories"
  ADD COLUMN "is_tax_exempt" BOOLEAN NOT NULL DEFAULT false;

UPDATE "finance"."finance_cashflow_categories"
SET "is_tax_exempt" = true
WHERE "code" IN (
  'EGR_SUELDO',
  'EGR_QUINCENA',
  'EGR_TURNO_EXTRA',
  'EGR_PREVIRED',
  'EGR_IVA_F29',
  'EGR_IMPUESTO',
  'EGR_RETIRO_SOCIO',
  'ING_AJUSTE_CONCILIACION',
  'EGR_AJUSTE_CONCILIACION'
);
