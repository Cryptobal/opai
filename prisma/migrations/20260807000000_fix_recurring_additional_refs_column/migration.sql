-- ════════════════════════════════════════════════════════════════════
-- Fix: column name drift en finance_dte_recurring_templates
-- ════════════════════════════════════════════════════════════════════
-- El schema declaraba `additionalReferences Json?` SIN @map, mientras
-- la migración original creó la columna como `additional_references`.
-- En producción la columna es snake_case y el client de Prisma generaba
-- queries con camelCase → P2022 "column additionalReferences does not
-- exist". El bug rompía /api/finance/billing/recurring,
-- /finanzas/facturacion/recurrentes y la pestaña Borradores que pre-fetchea
-- recurring templates.
--
-- Esta migración es 100% idempotente y maneja los 2 estados posibles del
-- DB: (a) columna ya snake_case (caso producción) → no-op, (b) columna
-- camelCase porque alguien corrió `prisma db push` en una rama de dev →
-- renombra de vuelta sin perder datos.
-- ════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Caso (b): columna camelCase existe Y la snake_case NO existe → renombrar.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'finance'
      AND table_name = 'finance_dte_recurring_templates'
      AND column_name = 'additionalReferences'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'finance'
      AND table_name = 'finance_dte_recurring_templates'
      AND column_name = 'additional_references'
  ) THEN
    EXECUTE 'ALTER TABLE "finance"."finance_dte_recurring_templates" RENAME COLUMN "additionalReferences" TO "additional_references"';
  END IF;

  -- Caso defensivo: ninguna existe → crear snake_case (no debería pasar
  -- en prod porque la migración original ya la creó).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'finance'
      AND table_name = 'finance_dte_recurring_templates'
      AND column_name IN ('additional_references', 'additionalReferences')
  ) THEN
    EXECUTE 'ALTER TABLE "finance"."finance_dte_recurring_templates" ADD COLUMN "additional_references" JSONB';
  END IF;

  -- Caso edge: AMBAS existen (algún manual messy). Migrar datos camelCase
  -- → snake_case si snake_case está vacío, luego dropear camelCase.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'finance'
      AND table_name = 'finance_dte_recurring_templates'
      AND column_name = 'additionalReferences'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'finance'
      AND table_name = 'finance_dte_recurring_templates'
      AND column_name = 'additional_references'
  ) THEN
    EXECUTE 'UPDATE "finance"."finance_dte_recurring_templates" SET "additional_references" = "additionalReferences" WHERE "additional_references" IS NULL AND "additionalReferences" IS NOT NULL';
    EXECUTE 'ALTER TABLE "finance"."finance_dte_recurring_templates" DROP COLUMN "additionalReferences"';
  END IF;
END $$;
