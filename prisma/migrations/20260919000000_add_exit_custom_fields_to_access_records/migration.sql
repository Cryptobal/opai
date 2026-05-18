-- Add exit_custom_fields column to AccessControlRecord to support
-- per-phase form field capture (entry vs exit). Existing rows get '{}'.
ALTER TABLE "access_control"."access_control_records"
  ADD COLUMN IF NOT EXISTS "exit_custom_fields" JSONB NOT NULL DEFAULT '{}'::jsonb;
