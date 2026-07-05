-- ──────────────────────────────────────────────────────────────────────
-- Interacción tipificada en notas de CRM (Fase 2). 100% ADITIVA y reversible.
--
-- Agrega a `crm.notes`:
--   · interaction_type TEXT NULL — tipo lógico de interacción, validado en la
--     app (note | contact | call | meeting | visit). Sin CHECK a propósito:
--     permite evolucionar el conjunto de tipos sin nueva migración.
--   · occurred_at TIMESTAMPTZ(6) NULL — cuándo OCURRIÓ la interacción (distinto
--     de created_at = cuándo se registró en OPAI).
--   · índice compuesto para filtrar el timeline por tipo.
--
-- Todo nullable → cero backfill, cero downtime. Reversión: DROP de columnas e
-- índice (ver bloque comentado al final).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."notes" ADD COLUMN IF NOT EXISTS "interaction_type" TEXT;
ALTER TABLE "crm"."notes" ADD COLUMN IF NOT EXISTS "occurred_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_crm_notes_entity_type"
  ON "crm"."notes" ("entity_type", "entity_id", "interaction_type");

-- Reversión (no ejecutar como parte de la migración):
--   DROP INDEX IF EXISTS "crm"."idx_crm_notes_entity_type";
--   ALTER TABLE "crm"."notes" DROP COLUMN IF EXISTS "occurred_at";
--   ALTER TABLE "crm"."notes" DROP COLUMN IF EXISTS "interaction_type";
