-- Agrega valor "CEDED" al enum FinancePaymentStatus.
-- Se usa cuando una factura emitida se cede 100% a factoring: el cobro
-- pasa a la empresa de factoring y nuestros KPIs "Por cobrar" y aging
-- deben excluir este estado. Si se cede parcial (advanceRate < 100),
-- el DTE se queda en UNPAID/PARTIAL.
ALTER TYPE "finance"."FinancePaymentStatus" ADD VALUE IF NOT EXISTS 'CEDED';
