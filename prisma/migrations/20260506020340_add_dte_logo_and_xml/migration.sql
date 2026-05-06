-- Soporte para PDF con logo (Feature 4 facturacion):
--
-- 1) tenant_dte_configs.logo_base64: logo del emisor (PNG/JPG en base64)
--    para imprimir en el PDF del DTE generado vía SimpleAPI impresion/pdf.
--    Opcional. Recomendado < 100KB para no inflar PDFs.
--
-- 2) finance_dtes.dte_xml: XML completo firmado/timbrado del DTE devuelto
--    por SimpleAPI dte/generar. Se persiste para poder regenerar el PDF en
--    cualquier momento sin re-emitir contra el SII (los endpoints SII no
--    exponen re-descarga de XMLs históricos).

-- AlterTable
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "logo_base64" TEXT;

-- AlterTable
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "dte_xml" BYTEA;
