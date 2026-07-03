-- ──────────────────────────────────────────────────────────────────────
-- Mensaje de bienvenida único del agente OPAI en Slack — Fase 7.1.
--
-- Marca cuándo se envió el mensaje de bienvenida (App Home / panel de IA) a un
-- usuario vinculado, para no repetirlo jamás. 100% aditiva: ADD COLUMN IF NOT
-- EXISTS, nullable.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."slack_user_links"
  ADD COLUMN IF NOT EXISTS "welcomed_at" TIMESTAMP(3);
