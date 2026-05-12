-- ════════════════════════════════════════════════════════════════
--  FinancePaymentRecord.bankTransactionId
-- ════════════════════════════════════════════════════════════════
--
-- Permite que un FinancePaymentRecord apunte al FinanceBankTransaction
-- que originó el pago. Cuando el usuario concilia un movimiento bancario
-- contra uno o varios DTE desde el drawer "Conciliar movimiento", el
-- service crea (o reutiliza) un FinancePaymentRecord con este FK
-- apuntando al mov. usado como medio de pago.
--
-- Beneficios:
--   - Trazabilidad completa banco → pago → DTE.
--   - Reversión clara al desconciliar (DELETE + recompute amountPaid).
--   - Marca el DTE como PAID/PARTIAL desde el flujo manual sin duplicar
--     lógica con el auto-match de import de cartolas.
--
-- Es ADITIVA: columna nullable, sin backfill destructivo. Para datos
-- legacy (links DTE_ISSUED/RECEIVED creados antes de este cambio sin
-- pago formal) se ejecuta el script `scripts/backfill-dte-payment-from-links.ts`
-- aparte.

ALTER TABLE "finance"."finance_payment_records"
  ADD COLUMN IF NOT EXISTS "bank_transaction_id" UUID;

-- FK con ON DELETE SET NULL: si el mov. bancario desaparece (raro, solo
-- cleanup manual), el pago queda huérfano pero no rompe.
ALTER TABLE "finance"."finance_payment_records"
  ADD CONSTRAINT "finance_payment_records_bank_transaction_id_fkey"
  FOREIGN KEY ("bank_transaction_id")
  REFERENCES "finance"."finance_bank_transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_finance_payment_record_bank_tx"
  ON "finance"."finance_payment_records"("bank_transaction_id");
