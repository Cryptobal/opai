-- Agrega política de fijación de UF a plantillas recurrentes.
-- Cuando currency=UF, define qué UF se usa para convertir a CLP al
-- momento de generar el borrador. Default RUN_DAY mantiene el
-- comportamiento anterior (UF del día de generación).
ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN IF NOT EXISTS "uf_fixing_policy" TEXT NOT NULL DEFAULT 'RUN_DAY',
  ADD COLUMN IF NOT EXISTS "uf_fixing_day" INTEGER;
