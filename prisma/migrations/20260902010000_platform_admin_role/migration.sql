-- F2: rol de PlatformAdmin. Aditivo; default admin hasta migrate-platform-roles.

ALTER TABLE "public"."platform_admins"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS "platform_audit_logs_actor_email_created_at_idx"
  ON "public"."platform_audit_logs"("actor_email", "created_at");

CREATE INDEX IF NOT EXISTS "platform_audit_logs_actor_type_created_at_idx"
  ON "public"."platform_audit_logs"("actor_type", "created_at");
