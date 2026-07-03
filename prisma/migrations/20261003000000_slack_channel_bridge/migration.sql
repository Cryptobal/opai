-- ──────────────────────────────────────────────────────────────────────
-- Puente bidireccional de canales Slack ↔ chat OPAI (Fase 4).
--
--   * slack_channel_links        : puente 1:1 canal OPAI ↔ canal Slack.
--   * slack_bridge_message_maps  : mapeo mensaje↔ts (hilos + dedupe entrante).
--   * enum chat."ChatSenderType" : nuevo valor SLACK (remitentes de Slack no
--                                  vinculados a un Admin).
--
-- Frontera de aislamiento: slack_team_id → tenant_id (getTenantForTeam).
-- 100% aditiva: ADD VALUE IF NOT EXISTS + CREATE TABLE/INDEX IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────────

-- Nuevo valor de enum (aditivo; Neon es PG15+). Idempotente.
ALTER TYPE "chat"."ChatSenderType" ADD VALUE IF NOT EXISTS 'SLACK';

-- Puente 1:1 canal OPAI ↔ canal Slack.
CREATE TABLE IF NOT EXISTS "public"."slack_channel_links" (
  "id"                 TEXT NOT NULL,
  "tenant_id"          TEXT NOT NULL,
  "workspace_id"       TEXT NOT NULL,
  "slack_channel_id"   TEXT NOT NULL,
  "slack_channel_name" TEXT NOT NULL,
  "chat_channel_id"    UUID NOT NULL,
  "enabled"            BOOLEAN NOT NULL DEFAULT true,
  "created_by"         TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_channel_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slack_channel_links_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."slack_workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_channel_link_tenant_slack"
  ON "public"."slack_channel_links" ("tenant_id", "slack_channel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_channel_link_tenant_chat"
  ON "public"."slack_channel_links" ("tenant_id", "chat_channel_id");
CREATE INDEX IF NOT EXISTS "idx_slack_channel_links_ws_enabled"
  ON "public"."slack_channel_links" ("workspace_id", "enabled");

-- Mapeo mensaje OPAI ↔ ts de Slack (hilos + dedupe).
CREATE TABLE IF NOT EXISTS "public"."slack_bridge_message_maps" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "link_id"          TEXT NOT NULL,
  "chat_message_id"  UUID NOT NULL,
  "slack_channel_id" TEXT NOT NULL,
  "slack_ts"         TEXT NOT NULL,
  "direction"        TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_bridge_message_maps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slack_bridge_message_maps_link_id_fkey"
    FOREIGN KEY ("link_id") REFERENCES "public"."slack_channel_links"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_bridge_message_maps_chat_message_id_key"
  ON "public"."slack_bridge_message_maps" ("chat_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_bridge_map_channel_ts"
  ON "public"."slack_bridge_message_maps" ("slack_channel_id", "slack_ts");
CREATE INDEX IF NOT EXISTS "idx_slack_bridge_map_link_created"
  ON "public"."slack_bridge_message_maps" ("link_id", "created_at");
