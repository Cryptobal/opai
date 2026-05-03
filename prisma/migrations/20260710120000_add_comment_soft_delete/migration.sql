-- Add edit/soft-delete columns to ops.ops_ticket_comments
ALTER TABLE "ops"."ops_ticket_comments"
  ADD COLUMN IF NOT EXISTS "original_body" TEXT,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "edited_by" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

CREATE INDEX IF NOT EXISTS "idx_ops_ticket_comments_deleted_at"
  ON "ops"."ops_ticket_comments" ("deleted_at");
