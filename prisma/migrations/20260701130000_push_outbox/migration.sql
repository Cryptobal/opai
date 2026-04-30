-- Push outbox for coalescing bursty notifications.
-- Pending rows (sent_at IS NULL) collect per (subscriberType, subscriberId, groupKey).
-- The flush-push-outbox cron picks up rows whose scheduledFor has passed and
-- emits a single coalesced banner.

CREATE TABLE IF NOT EXISTS "public"."push_outbox" (
  "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id"       TEXT NOT NULL,
  "subscriber_type" TEXT NOT NULL,
  "subscriber_id"   TEXT NOT NULL,
  "notif_key"       TEXT NOT NULL,
  "group_key"       TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "url"             TEXT,
  "data"            JSONB DEFAULT '{}',
  "count"           INTEGER NOT NULL DEFAULT 1,
  "scheduled_for"   TIMESTAMPTZ(6) NOT NULL,
  "sent_at"         TIMESTAMPTZ(6),
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_push_outbox_due"
  ON "public"."push_outbox" ("scheduled_for") WHERE "sent_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_push_outbox_group"
  ON "public"."push_outbox" ("subscriber_type", "subscriber_id", "group_key") WHERE "sent_at" IS NULL;
