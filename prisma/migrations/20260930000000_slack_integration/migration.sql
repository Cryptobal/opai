-- ──────────────────────────────────────────────────────────────────────
-- Integración Slack (Fase 1) — fundación multi-tenant + notificaciones.
--
--   * slack_workspaces      : 1 workspace por tenant (token de bot cifrado).
--   * slack_channel_routes  : ruteo notificación→canal (KEY | MODULE).
--   * slack_outbox          : cola de entrega con reintento por cron.
--   * slack_user_links      : vínculo usuario Slack ↔ Admin (poblado en Fase 2).
--
-- Frontera de aislamiento: slack_team_id → slack_workspaces.tenant_id.
-- 100% aditiva: CREATE TABLE/INDEX IF NOT EXISTS. Sin DROP ni ALTER destructivo.
-- ──────────────────────────────────────────────────────────────────────

-- Workspace conectado por tenant (1:1)
CREATE TABLE IF NOT EXISTS "public"."slack_workspaces" (
  "id"                   TEXT NOT NULL,
  "tenant_id"            TEXT NOT NULL,
  "slack_team_id"        TEXT NOT NULL,
  "team_name"            TEXT NOT NULL,
  "bot_user_id"          TEXT NOT NULL,
  "bot_token_enc"        TEXT NOT NULL,
  "scopes"               TEXT NOT NULL,
  "installed_by"         TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'ACTIVE',
  "default_channel_id"   TEXT,
  "default_channel_name" TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "slack_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_workspaces_tenant_id_key"
  ON "public"."slack_workspaces" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "slack_workspaces_slack_team_id_key"
  ON "public"."slack_workspaces" ("slack_team_id");
CREATE INDEX IF NOT EXISTS "idx_slack_workspaces_tenant"
  ON "public"."slack_workspaces" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_slack_workspaces_team"
  ON "public"."slack_workspaces" ("slack_team_id");

-- Ruteo notificación→canal
CREATE TABLE IF NOT EXISTS "public"."slack_channel_routes" (
  "id"           TEXT NOT NULL,
  "tenant_id"    TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "match_type"   TEXT NOT NULL,
  "match_value"  TEXT NOT NULL,
  "channel_id"   TEXT NOT NULL,
  "channel_name" TEXT NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "slack_channel_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_route_tenant_match"
  ON "public"."slack_channel_routes" ("tenant_id", "match_type", "match_value");
CREATE INDEX IF NOT EXISTS "idx_slack_routes_tenant_enabled"
  ON "public"."slack_channel_routes" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "idx_slack_routes_workspace"
  ON "public"."slack_channel_routes" ("workspace_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slack_channel_routes_workspace_id_fkey'
  ) THEN
    ALTER TABLE "public"."slack_channel_routes"
      ADD CONSTRAINT "slack_channel_routes_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."slack_workspaces" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Cola de entrega
CREATE TABLE IF NOT EXISTS "public"."slack_outbox" (
  "id"           TEXT NOT NULL,
  "tenant_id"    TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "channel_id"   TEXT NOT NULL,
  "payload"      JSONB NOT NULL,
  "dedupe_key"   TEXT,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "last_error"   TEXT,
  "sent_at"      TIMESTAMP(3),
  "slack_ts"     TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_outbox_dedupe_key_key"
  ON "public"."slack_outbox" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "idx_slack_outbox_status_created"
  ON "public"."slack_outbox" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_slack_outbox_tenant_created"
  ON "public"."slack_outbox" ("tenant_id", "created_at");

-- Vínculo usuario Slack ↔ Admin (poblado en Fase 2)
CREATE TABLE IF NOT EXISTS "public"."slack_user_links" (
  "id"            TEXT NOT NULL,
  "tenant_id"     TEXT NOT NULL,
  "workspace_id"  TEXT NOT NULL,
  "slack_user_id" TEXT NOT NULL,
  "admin_id"      TEXT NOT NULL,
  "slack_email"   TEXT,
  "linked_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_user_link_ws_user"
  ON "public"."slack_user_links" ("workspace_id", "slack_user_id");
CREATE INDEX IF NOT EXISTS "idx_slack_user_links_admin"
  ON "public"."slack_user_links" ("admin_id");
