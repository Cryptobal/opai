-- Ensure created_from_lead_id exists (fix for DBs where migration 20260220150000 wasn't applied)
ALTER TABLE "cpq"."quotes" ADD COLUMN IF NOT EXISTS "created_from_lead_id" UUID;
