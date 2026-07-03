-- ──────────────────────────────────────────────────────────────────────
-- Canal Slack PERSONAL (DM del bot) — Fase 6.
--
-- Cachea el id del canal DM (im) del usuario tras conversations.open, para no
-- resolverlo por cada notificación. 100% aditiva: ADD COLUMN IF NOT EXISTS.
-- La preferencia por-tipo del canal `slack` vive en el JSON `preferences` de
-- notification_preferences (sin cambio de esquema).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."slack_user_links"
  ADD COLUMN IF NOT EXISTS "dm_channel_id" TEXT;
