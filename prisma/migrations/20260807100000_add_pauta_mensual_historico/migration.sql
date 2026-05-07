-- ════════════════════════════════════════════════════════════════════
-- Histórico de desasignación en pauta mensual
-- ════════════════════════════════════════════════════════════════════
-- Originalmente esta migración vivía en `migrations-pending/2026-05-06-
-- pauta-mensual-historico.sql` para ejecución manual antes del deploy de
-- la PR #421. El deploy salió pero la migración manual no se corrió, así
-- que el client de Prisma quedó pidiendo columnas (`previous_guardia_id`,
-- `unassigned_at`, `unassigned_reason`) que no existían en la BD →
-- todas las queries a `ops.pauta_mensual` fallaban con P2022.
--
-- Esto rompía, entre otros:
--   • /api/ops/rondas/monitoreo/grid/refresh (500)
--   • /api/portal/guardia/schedule (500)
--   • la sincronización de rondaExpected en generateGridSlots → la grilla
--     del CN se quedaba con TODAS las celdas en `rondaExpected = true`
--     (default de schema), llenando los cuadros del operador con rondas
--     "programadas" en cada hora del turno en vez de respetar la
--     frecuencia real configurada por puesto.
--
-- Esta migración promueve el SQL pendiente al pipeline normal de
-- `prisma migrate deploy`. Es 100% idempotente — usa IF NOT EXISTS, así
-- que si alguien la corrió a mano en un entorno, este replay es no-op.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "ops"."pauta_mensual"
  ADD COLUMN IF NOT EXISTS "previous_guardia_id" UUID,
  ADD COLUMN IF NOT EXISTS "unassigned_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "unassigned_reason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema = 'ops'
      AND  table_name   = 'pauta_mensual'
      AND  constraint_name = 'pauta_mensual_previous_guardia_id_fkey'
  ) THEN
    ALTER TABLE "ops"."pauta_mensual"
      ADD CONSTRAINT "pauta_mensual_previous_guardia_id_fkey"
      FOREIGN KEY ("previous_guardia_id")
      REFERENCES "ops"."guardias"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_ops_pauta_previous_guardia"
  ON "ops"."pauta_mensual"("previous_guardia_id");

CREATE INDEX IF NOT EXISTS "idx_ops_pauta_unassigned_at"
  ON "ops"."pauta_mensual"("unassigned_at");
