-- Dos nuevos parámetros en finance_cashflow_config para controlar qué
-- porcentaje del turno extra proyectado se descuenta del sueldo líquido
-- y de las leyes sociales (PreviRed) en el mismo período.

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "turnos_extra_liquido_discount_pct"  DECIMAL(5,4) NOT NULL DEFAULT 1;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "turnos_extra_previred_discount_pct" DECIMAL(5,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "finance"."finance_cashflow_config"."turnos_extra_liquido_discount_pct"
  IS '% del TE proyectado que reduce el pago de sueldo líquido. 1 = 100%.';

COMMENT ON COLUMN "finance"."finance_cashflow_config"."turnos_extra_previred_discount_pct"
  IS '% del TE proyectado que reduce el pago de PreviRed. 0 = no descontar.';
