-- IMPORTANTE: Antes de aplicar este PR a producción, ejecutar las siguientes
-- queries de pre-verificación y reportar los counts:
--   SELECT COUNT(*) AS total FROM access_control.access_control_lists;
--   SELECT COUNT(*) AS rut_null FROM access_control.access_control_lists WHERE rut IS NULL;
--   SELECT COUNT(*) AS rut_empty FROM access_control.access_control_lists WHERE rut = '';
--   SELECT indexname, indexdef FROM pg_indexes
--     WHERE schemaname = 'access_control' AND tablename = 'access_control_lists';
-- Si rut_null > 0 o rut_empty > 0, NO aplicar — investigar primero.

-- 1. Agregar vehicle_plate
ALTER TABLE access_control.access_control_lists
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;

CREATE INDEX IF NOT EXISTS idx_ac_lists_plate
  ON access_control.access_control_lists (vehicle_plate)
  WHERE vehicle_plate IS NOT NULL;

-- 2. Hacer rut opcional
ALTER TABLE access_control.access_control_lists
  ALTER COLUMN rut DROP NOT NULL;

-- 3. Check: al menos uno de los dos no nulo (rut o vehicle_plate)
ALTER TABLE access_control.access_control_lists
  DROP CONSTRAINT IF EXISTS ac_lists_identifier_required;

ALTER TABLE access_control.access_control_lists
  ADD CONSTRAINT ac_lists_identifier_required
  CHECK (
    (rut IS NOT NULL AND rut <> '') OR
    (vehicle_plate IS NOT NULL AND vehicle_plate <> '')
  );
