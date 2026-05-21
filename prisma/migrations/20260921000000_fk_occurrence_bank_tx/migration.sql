-- ──────────────────────────────────────────────────────────────────────
-- Bug 1701 — limpieza completa de zombies + FK con SetNull.
--
-- Una sola migración hace tres cosas en orden:
--   1. RAISE NOTICE con conteos de zombies por tipo (visibles en los
--      logs del build de Vercel para auditoría).
--   2. UPDATE masivo: baja a PROJECTED y nullifica refs en occurrences
--      zombi (tipo A: tx oculto, tipo B: DTE UNPAID/OVERDUE, tipo C:
--      tx inexistente).
--   3. ALTER TABLE para convertir bank_transaction_id en FK con
--      ON DELETE SET NULL. Defensa en profundidad: si en el futuro
--      alguien borra un tx por SQL directo o un workflow que olvide
--      llamar clearTransactionLinks/hideTransaction, Postgres
--      nullifica en vez de dejar la FK rota.
--
-- Idempotente: si no hay zombies, el UPDATE pasa con 0 filas. Si la
-- constraint ya existe (re-ejecución parcial), el IF NOT EXISTS evita
-- el error. El índice idx_cashflow_occ_bank_tx existente se preserva.
-- ──────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  count_a bigint;
  count_b bigint;
  count_c bigint;
  count_total bigint;
BEGIN
  -- Conteos de auditoría — quedan en los logs del build.
  SELECT COUNT(*) INTO count_a
  FROM "finance"."finance_cashflow_occurrences" o
  JOIN "finance"."finance_bank_transactions" bt ON bt.id = o."bank_transaction_id"
  WHERE o.status = 'PAID' AND bt."hidden_at" IS NOT NULL;

  SELECT COUNT(*) INTO count_b
  FROM "finance"."finance_cashflow_occurrences" o
  JOIN "finance"."finance_dtes" d ON d.id = o."dte_id"
  WHERE o.status = 'PAID'
    AND o."bank_transaction_id" IS NOT NULL
    AND d."payment_status" IN ('UNPAID', 'OVERDUE');

  SELECT COUNT(*) INTO count_c
  FROM "finance"."finance_cashflow_occurrences" o
  WHERE o.status = 'PAID'
    AND o."bank_transaction_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "finance"."finance_bank_transactions" bt
      WHERE bt.id = o."bank_transaction_id"
    );

  count_total := count_a + count_b + count_c;

  RAISE NOTICE 'Bug 1701 cleanup — zombies por tipo:';
  RAISE NOTICE '  Tipo A (tx oculto):        %', count_a;
  RAISE NOTICE '  Tipo B (DTE UNPAID/OVER):  %', count_b;
  RAISE NOTICE '  Tipo C (tx inexistente):   %', count_c;
  RAISE NOTICE '  Total estimado a limpiar:  %', count_total;
END $$;

-- Limpieza tipo A + B + C en una sola operación. Los predicados se
-- combinan con OR — una occurrence puede caer en >1 tipo (ej: tx
-- oculto Y DTE UNPAID) pero solo se actualiza una vez.
UPDATE "finance"."finance_cashflow_occurrences" o
SET "status" = 'PROJECTED',
    "bank_transaction_id" = NULL,
    "matched_at" = NULL,
    "matched_by" = NULL
FROM (
  SELECT o2.id
  FROM "finance"."finance_cashflow_occurrences" o2
  LEFT JOIN "finance"."finance_dtes" d
    ON d.id = o2."dte_id"
  LEFT JOIN "finance"."finance_bank_transactions" bt
    ON bt.id = o2."bank_transaction_id"
  WHERE o2.status = 'PAID'
    AND o2."bank_transaction_id" IS NOT NULL
    AND (
      bt."hidden_at" IS NOT NULL                          -- tipo A
      OR bt.id IS NULL                                     -- tipo C
      OR d."payment_status" IN ('UNPAID', 'OVERDUE')      -- tipo B
    )
) zombies
WHERE o.id = zombies.id;

-- Agregar FK con SetNull. IF NOT EXISTS por si la constraint quedó
-- aplicada parcialmente en una corrida previa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_cashflow_occurrences_bank_transaction_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_cashflow_occurrences"
      ADD CONSTRAINT "finance_cashflow_occurrences_bank_transaction_id_fkey"
      FOREIGN KEY ("bank_transaction_id")
      REFERENCES "finance"."finance_bank_transactions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
