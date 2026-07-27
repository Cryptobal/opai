-- ──────────────────────────────────────────────────────────────────────
-- crm.files — procedencia de correo + hash de contenido (ADITIVA, B5).
--
-- Cuatro columnas nullable + dos índices, sin backfill ni cambios sobre
-- filas o columnas existentes. Los CrmFile previos quedan con procedencia
-- nula y siguen funcionando. Idempotente (IF NOT EXISTS) y reversible
-- (DROP COLUMN sobre columnas sin datos críticos).
--
--   source_type       — "email" | NULL (origen del archivo).
--   source_thread_id  — CrmEmailThread.id del que salió el adjunto.
--   source_message_id — providerMessageId de Gmail del mensaje de origen.
--   content_hash      — sha256 hex del binario; dedupe SIEMPRE por tenant
--                       (sin índice único: colisiones legacy/cross-tenant
--                       deben poder coexistir).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."files"
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_thread_id" UUID,
  ADD COLUMN IF NOT EXISTS "source_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT;

CREATE INDEX IF NOT EXISTS "idx_crm_files_source_thread"
  ON "crm"."files" ("tenant_id", "source_thread_id");

CREATE INDEX IF NOT EXISTS "idx_crm_files_content_hash"
  ON "crm"."files" ("tenant_id", "content_hash");
