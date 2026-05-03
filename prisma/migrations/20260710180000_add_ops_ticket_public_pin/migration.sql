-- Portal público read-only por PIN (L2)
ALTER TABLE "ops"."ops_tickets"
  ADD COLUMN IF NOT EXISTS "public_pin_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "public_pin_set_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "public_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "public_locked_until" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "public_last_access_at" TIMESTAMPTZ(6);
