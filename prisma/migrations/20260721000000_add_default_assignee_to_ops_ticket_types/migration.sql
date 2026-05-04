-- Add missing column ops_ticket_types.default_assigned_to_user_id
-- This column was added to schema.prisma in PR #343 (supervision DS v3) but no
-- migration was ever generated. Production DBs are missing the column, which
-- breaks ensureDefaultPlaybook() when seeding onboarding ticket types.

ALTER TABLE "ops"."ops_ticket_types"
  ADD COLUMN IF NOT EXISTS "default_assigned_to_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_ops_ticket_types_default_assignee"
  ON "ops"."ops_ticket_types" ("default_assigned_to_user_id");
