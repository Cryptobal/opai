-- ────────────────────────────────────────────────────────────────────────────
-- Convierte finance_cashflow_occurrences.bank_transaction_id en FK con
-- ON DELETE SET NULL. Defensa en profundidad para el bug 1701: si en el
-- futuro se borra un bank_transaction (por SQL directo, migración, o un
-- workflow que olvide llamar a clearTransactionLinks / hideTransaction),
-- la occurrence queda con bank_transaction_id NULL en vez de apuntar a
-- una FK rota.
--
-- IMPORTANTE: antes de agregar la constraint, ponemos a NULL las
-- referencias huérfanas (zombies tipo C). Sin esto, el ALTER TABLE
-- falla con violation. El índice idx_cashflow_occ_bank_tx existente
-- se preserva (Prisma no crea índice automático para FKs en Postgres).
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Limpiar orphan refs antes del constraint.
UPDATE "finance"."finance_cashflow_occurrences" o
SET "bank_transaction_id" = NULL,
    "matched_at" = NULL,
    "matched_by" = NULL,
    "status" = CASE WHEN "status" = 'PAID' THEN 'PROJECTED' ELSE "status" END
WHERE "bank_transaction_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "finance"."finance_bank_transactions" bt
    WHERE bt.id = o."bank_transaction_id"
  );

-- 2. Agregar FK con SetNull.
ALTER TABLE "finance"."finance_cashflow_occurrences"
  ADD CONSTRAINT "finance_cashflow_occurrences_bank_transaction_id_fkey"
  FOREIGN KEY ("bank_transaction_id")
  REFERENCES "finance"."finance_bank_transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
