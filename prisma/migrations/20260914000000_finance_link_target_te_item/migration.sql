-- Agrega TE_ITEM al enum FinanceLinkTarget para permitir vincular un
-- movimiento bancario a un OpsPagoTeItem individual (granularidad de
-- item de planilla, no solo lote completo). Habilita split N:1 cuando
-- el banco consolida varios turnos del mismo guardia en una transferencia.
ALTER TYPE "finance"."FinanceLinkTarget" ADD VALUE IF NOT EXISTS 'TE_ITEM';
