-- Agrega campos faltantes para que NC (61) y ND (56) cumplan con el bloque
-- <Referencia> exigido por el SII:
--   - reference_date: fecha del DTE original referenciado (FchRef)
--   - reference_code: código de referencia SII (CodRef)
--                      1 = Anula documento original
--                      2 = Corrige texto (no montos)
--                      3 = Corrige montos
--
-- Ya existían: reference_dte_id, reference_type, reference_folio,
-- reference_reason. Esta migration completa la tupla.

-- AlterTable
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "reference_date" DATE,
  ADD COLUMN "reference_code" INTEGER;
