-- ──────────────────────────────────────────────────────────────────────
-- Fase 16 — Deal Rooms: sala de Slack (canal privado) por negocio importante.
--
-- Un canal por CrmDeal: ficha viva fijada + todos los eventos del deal + notas
-- desde cualquier mensaje. `deal_id` único. 100% aditiva: CREATE TABLE/INDEX
-- IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."crm_deal_slack_rooms" (
  "id"                 TEXT NOT NULL,
  "tenant_id"          TEXT NOT NULL,
  "deal_id"            TEXT NOT NULL,
  "slack_channel_id"   TEXT NOT NULL,
  "slack_channel_name" TEXT NOT NULL,
  "ficha_ts"           TEXT,
  "status"             TEXT NOT NULL DEFAULT 'OPEN',
  "created_by"         TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_deal_slack_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_deal_slack_rooms_deal_id_key"
  ON "public"."crm_deal_slack_rooms" ("deal_id");
CREATE INDEX IF NOT EXISTS "idx_crm_deal_slack_room_tenant"
  ON "public"."crm_deal_slack_rooms" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_crm_deal_slack_room_channel"
  ON "public"."crm_deal_slack_rooms" ("slack_channel_id");
