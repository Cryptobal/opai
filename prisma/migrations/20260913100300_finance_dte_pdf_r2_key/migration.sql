-- Agrega pdf_r2_key a finance.finance_dtes para persistir el PDF firmado
-- en R2 después de la primera emisión. Los reenvíos posteriores reusan
-- el blob de R2 en vez de re-renderizar con pdf-lib + bwip-js.
--
-- Sin backfill: la columna queda NULL para DTEs históricos y se llena
-- lazy en el próximo envío vía simpleapi.provider.getPdf({ dteId, tenantId }).

ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "pdf_r2_key" TEXT;
