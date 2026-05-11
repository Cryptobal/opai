-- ════════════════════════════════════════════════════════════════
--  Factoring · FinanceLinkTarget.FACTORING_OPERATION (Fase 4)
-- ════════════════════════════════════════════════════════════════
--
-- Permite que un FinanceBankTransactionLink apunte a una operación de
-- factoring (FinanceFactoringOperation) — usado para conciliar el
-- abono del monto a girar contra el bank tx correspondiente.
--
-- Postgres requiere ALTER TYPE ADD VALUE fuera de transacción explícita;
-- Prisma migrate deploy lo corre en su propio statement.

ALTER TYPE "finance"."FinanceLinkTarget" ADD VALUE IF NOT EXISTS 'FACTORING_OPERATION';
