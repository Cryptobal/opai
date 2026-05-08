-- Agrega cession_provider en tenant_dte_configs.
--
-- Separa el provider de CESIÓN electrónica (AEC) del provider de
-- emisión de DTE. Se necesita porque el plan SimpleAPI básico que
-- usan los tenants existentes NO incluye el endpoint de cesión
-- (/api/v1/dte/cesion/generar devuelve HTTP 404 con esas apikeys).
--
-- Default "SII_DIRECT": construimos el AEC nosotros mismos, lo
-- firmamos con el cert digital del tenant, y lo enviamos directo al
-- RPETC del SII vía RTCAnotEnvio.cgi. Sin dependencia de SimpleAPI
-- para la cesión.
--
-- Ver HANDOFF-CESION-SII-DIRECT.md (raíz del repo) para contexto.
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "cession_provider" TEXT NOT NULL DEFAULT 'SII_DIRECT';
