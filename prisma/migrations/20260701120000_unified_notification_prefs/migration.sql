-- Unified notification preferences (replaces UserNotificationPreference + PortalNotificationPreference)
-- Coexists with the legacy tables until the cleanup block; backfills from both sources.

CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
  "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "subscriber_type"   TEXT NOT NULL,           -- 'ADMIN' | 'GUARD' | 'CLIENT'
  "subscriber_id"     TEXT NOT NULL,
  "preferences"       JSONB NOT NULL DEFAULT '{}',
  "quiet_hours_start" INTEGER,                 -- 0-23, NULL = sin quiet hours
  "quiet_hours_end"   INTEGER,                 -- 0-23
  "quiet_hours_tz"    TEXT DEFAULT 'America/Santiago',
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_notif_prefs" UNIQUE ("subscriber_type", "subscriber_id")
);

CREATE INDEX IF NOT EXISTS "idx_notif_prefs_tenant"
  ON "public"."notification_preferences" ("tenant_id");

-- Backfill from UserNotificationPreference (admins)
INSERT INTO "public"."notification_preferences"
  ("tenant_id", "subscriber_type", "subscriber_id", "preferences", "updated_at")
SELECT "tenant_id", 'ADMIN', "user_id", "preferences", "updated_at"
FROM "crm"."user_notification_preferences"
ON CONFLICT ("subscriber_type", "subscriber_id") DO NOTHING;

-- Backfill from PortalNotificationPreference (guards/clients).
-- Multiple portal rows for the same user_type/user_id (one per portalType) are merged
-- by deep-merging preferences JSON; the most recently updated row wins on conflicts.
INSERT INTO "public"."notification_preferences"
  ("tenant_id", "subscriber_type", "subscriber_id", "preferences", "updated_at")
SELECT
  "tenant_id",
  CASE
    WHEN "user_type" = 'guardia' THEN 'GUARD'
    WHEN "user_type" = 'contact' THEN 'CLIENT'
    ELSE 'ADMIN'
  END AS "subscriber_type",
  "user_id",
  "preferences",
  "updated_at"
FROM "public"."portal_notification_preferences"
ON CONFLICT ("subscriber_type", "subscriber_id") DO UPDATE
  SET "preferences" = "notification_preferences"."preferences" || EXCLUDED."preferences",
      "updated_at"  = GREATEST("notification_preferences"."updated_at", EXCLUDED."updated_at");
