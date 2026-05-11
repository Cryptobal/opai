-- ════════════════════════════════════════════════════════════════
--  Factoring · Simulación del cesionario (Fase 1)
-- ════════════════════════════════════════════════════════════════
--
-- Permite adjuntar el PDF de simulación que el factoring envía y
-- guardar los campos extraídos por IA + el costo financiero real
-- y la tasa efectiva mensual derivada.

ALTER TABLE "finance"."finance_factoring_operations"
  ADD COLUMN IF NOT EXISTS "simulation_file_url"      TEXT,
  ADD COLUMN IF NOT EXISTS "simulation_file_key"      TEXT,
  ADD COLUMN IF NOT EXISTS "simulation_file_name"     TEXT,
  ADD COLUMN IF NOT EXISTS "simulation_extracted_at"  TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "simulation_extracted_json" JSONB,
  ADD COLUMN IF NOT EXISTS "sim_monto_a_girar"        DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_dif_precio"           DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_comision"             DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_iva"                  DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_gastos_legal"         DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_notaria"              DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "sim_gastos_operacionales" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "costo_financiero"         DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "effective_monthly_rate"   DECIMAL(8,4);

COMMENT ON COLUMN "finance"."finance_factoring_operations"."simulation_file_url"
  IS 'URL pública (R2) del PDF de simulación enviado por el factoring.';
COMMENT ON COLUMN "finance"."finance_factoring_operations"."simulation_file_key"
  IS 'Storage key R2 (para borrado/regeneración) — tenantId/factoring-sims/YYYY/MM/uuid.pdf.';
COMMENT ON COLUMN "finance"."finance_factoring_operations"."simulation_extracted_json"
  IS 'JSON crudo devuelto por IA con todos los campos extraídos del PDF (incluso los que no mapeamos a columnas).';
COMMENT ON COLUMN "finance"."finance_factoring_operations"."costo_financiero"
  IS 'Costo financiero real = invoice_amount − monto_a_girar (incluye dif precio + comisión + IVA + gastos).';
COMMENT ON COLUMN "finance"."finance_factoring_operations"."effective_monthly_rate"
  IS 'Tasa efectiva mensual real = (costo_financiero / advance_amount) × (30 / plazo_dias). Para comparar empresas.';
