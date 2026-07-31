-- Intenciones de respuesta sugeridas por IA (chips del lector de Correos).
-- Caché por hilo con la misma semántica que ai_thread_summary: se invalida
-- comparando lastMessageId, sin TTL ni jobs.
-- Forma: { intents: [{ id, label, hint }], lastMessageId, generatedAt }
--
-- Aditiva y nullable: no toca datos existentes.
-- Rollback: ALTER TABLE crm.email_threads DROP COLUMN IF EXISTS ai_reply_intents;

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "ai_reply_intents" JSONB;
