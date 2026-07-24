-- ──────────────────────────────────────────────────────────────────────
-- crm.tasks.notes — contexto libre de la tarea (ADITIVA).
--
-- Campo de texto opcional para detalles / condiciones de cierre / enlaces.
-- Nullable, sin backfill, sin índice: sin impacto en filas existentes ni en
-- consumidores actuales (agenda, móvil, correos-tasks). Idempotente.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
