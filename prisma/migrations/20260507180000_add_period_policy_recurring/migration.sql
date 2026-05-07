-- Agrega `period_policy` a FinanceDteRecurringTemplate.
--
-- Define cómo el resolver de placeholders ({{periodo}}, {{periodo_mes}},
-- {{periodo_anio}}) calcula el período al ejecutar la plantilla:
--   - CURRENT_MONTH (default): mes del run del cron. Para facturas
--     cobradas por adelantado (ej: cron del 1-may-2026 → "Mayo 2026").
--   - PREVIOUS_MONTH: mes anterior al run. Para facturas vencidas
--     (cron del 1-jun-2026 → "Mayo 2026").
--   - NEXT_MONTH: mes siguiente al run. Casos especiales.
--
-- Default seguro: CURRENT_MONTH preserva el comportamiento previo de
-- todas las plantillas existentes que no usan placeholders.
ALTER TABLE "finance"."finance_dte_recurring_templates"
ADD COLUMN "period_policy" TEXT NOT NULL DEFAULT 'CURRENT_MONTH';
