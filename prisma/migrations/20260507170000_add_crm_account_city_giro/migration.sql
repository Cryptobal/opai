-- Agrega `city` y `giro` a CrmAccount.
--
-- - city: Ciudad del cliente. Distinto a `commune`. SII exige ambos en
--   el bloque <Receptor> de DTEs (Comuna + Ciudad).
-- - giro: Giro / Actividad económica formal del cliente. Distinto a
--   `industry` (que es segmento comercial interno usado en CRM/reportes).
--   El SII lo exige en el bloque <Receptor> de facturas (33/34).
--
-- Ambos campos se autocompletan al receptor cuando se crea un DTE para
-- esta cuenta (vía /api/finance/billing/receiver-suggestions).
ALTER TABLE "crm"."accounts" ADD COLUMN "city" TEXT;
ALTER TABLE "crm"."accounts" ADD COLUMN "giro" TEXT;
