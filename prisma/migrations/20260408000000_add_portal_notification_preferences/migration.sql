-- Task 5.2: Add PortalNotificationPreference model for portal push notification preferences
CREATE TABLE IF NOT EXISTS "public"."portal_notification_preferences" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "user_type" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "portal_type" TEXT NOT NULL,
  "preferences" JSONB NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "portal_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_portal_notif_prefs"
  ON "public"."portal_notification_preferences" ("user_type", "user_id", "portal_type");

CREATE INDEX IF NOT EXISTS "idx_portal_notif_prefs_tenant"
  ON "public"."portal_notification_preferences" ("tenant_id");
