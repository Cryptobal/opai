-- Caché de detalle de hilo (C18, PR-13). Migración aditiva: metadata de
-- adjuntos persistida + marca de frescura para servir el detalle desde la BD
-- espejo sin threads.get en caliente.

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "attachments_meta" JSONB,
  ADD COLUMN IF NOT EXISTS "detail_cached_at" TIMESTAMPTZ(6);
