-- Soporte multi-referencias en DTE (Feature 1 facturacion):
-- Array JSON con referencias adicionales (no-DTE) a OC, HES, Contrato,
-- Resolucion, etc. Se serializan al bloque <Referencia> del XML SII junto
-- con la referencia principal (si la hay). Hasta 40 refs totales por DTE.

-- AlterTable
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "additional_references" JSONB;
