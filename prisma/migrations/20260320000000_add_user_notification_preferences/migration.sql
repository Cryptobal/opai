-- CreateTable
CREATE TABLE IF NOT EXISTS "crm"."user_notification_preferences" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_notification_prefs_user_tenant" ON "crm"."user_notification_preferences"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_user_notification_prefs_user" ON "crm"."user_notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_user_notification_prefs_tenant" ON "crm"."user_notification_preferences"("tenant_id");
