-- ──────────────────────────────────────────────────────────────────────
-- Contexto del panel de IA (agente nativo de Slack) — Fase 7.1.
--
-- Guarda el canal activo del usuario (assistant_thread_context_changed) para
-- responder situado cuando mira un canal puenteado. 100% aditiva: ADD COLUMN IF
-- NOT EXISTS, nullable.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."slack_user_links"
  ADD COLUMN IF NOT EXISTS "active_channel_id" TEXT;
