-- Fix: finance_rendiciones.beneficiary_admin_id estaba tipada UUID pero
-- referencia a Admin.id (CUID). Insertar un CUID en columna UUID rompe con
-- "Error creating UUID, invalid character: found 'm' at 2". Cambiamos a TEXT.
ALTER TABLE "finance"."finance_rendiciones"
  ALTER COLUMN "beneficiary_admin_id" TYPE TEXT USING "beneficiary_admin_id"::text;
