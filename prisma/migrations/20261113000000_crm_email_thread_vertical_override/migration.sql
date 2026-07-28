-- ──────────────────────────────────────────────────────────────────────
-- crm.email_threads — override humano de vertical (ADITIVA).
--
-- Tres columnas nullable sin backfill ni cambios sobre filas existentes.
-- Los hilos previos quedan con vertical_override = NULL y se comportan
-- igual que hoy. Idempotente (IF NOT EXISTS) y reversible
-- (DROP COLUMN sobre columnas sin datos críticos).
--
--   vertical_override        — clave de VERTICAL_CAPABILITY (≠ "otro") o NULL.
--   vertical_override_by_id  — Admin.id (cuid) del autor (trazabilidad, sin FK).
--   vertical_override_at     — timestamp de la corrección.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "vertical_override" TEXT;
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "vertical_override_by_id" TEXT;
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "vertical_override_at" TIMESTAMPTZ(6);
